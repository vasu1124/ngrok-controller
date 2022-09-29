import { Logger } from "log4js";
import Operator, { ResourceEventType, ResourceEvent, ResourceMeta, ResourceMetaImpl } from '@dot-i/k8s-operator';
import { setIntervalAsync, SetIntervalAsyncTimer } from 'set-interval-async/fixed';
import * as k8s from '@kubernetes/client-node';
import {Mutex} from 'async-mutex';
import * as ngrok from 'ngrok';

const annotation = 'vasu1124/ngrok';
const mutex = new Mutex();

interface ngrokConnection {
  url: string;
  target: string;
  name: string | undefined;
  namespace: string | undefined;
}

export default class NgrokController extends Operator {

  ngrokMap: Map<string | undefined, ngrokConnection> = new Map<string, ngrokConnection>();
  reconcileTimer: SetIntervalAsyncTimer<[]>;

  constructor(protected log: Logger, reconcileInterval: number) {
    super(log);
    // Inittialize timer
    this.reconcileTimer = setIntervalAsync(async () => {
      this.log.debug("reconcileTimer: Running reconcile from timer");
      await this.reconcile();
    }, reconcileInterval);
  }

  protected async init() {

    await this.watchResource('', 'v1', 'services', async (e) => {
      const object: k8s.V1Service = e.object;

      this.log.debug("received event ...", e.type);

      switch (e.type) {
        case ResourceEventType.Added:
        case ResourceEventType.Modified:
          this.handleCreateOrUpdateResource(object);
          break;
        case ResourceEventType.Deleted:
          this.handleDeleteResource(object);
          break;
      }

    });
  }

  private async reconcile() {
    this.log.debug("reconciling ...");
    const { response, body } = await this.k8sApi.listServiceForAllNamespaces();
    //any changes missed?
    body.items.forEach(object => this.handleCreateOrUpdateResource(object));

    //any deletions missed?
    this.ngrokMap.forEach( (value, key) => {
      const service2delete = body.items.filter(object => object.metadata?.uid === key)
      //key in active ngrokMap, but no service object
      if(service2delete.length === 0)
        this.handleDeleteResource({ "metadata": { "uid": key, "name": value.name, "namespace": value.namespace }});
    });    
  }

  private async handleDeleteResource(object: k8s.V1Service): Promise<void> {
    if (!this.ngrokMap.has(object.metadata?.uid)) {
      this.log.warn("No active Ngrok for this service " + object.metadata?.uid);
      return;
    }

    const uid = object.metadata?.uid;
    await this.disconnectNgrok(uid, this.ngrokMap.get(object.metadata?.uid));
  }

  private handleCreateOrUpdateResource(object: k8s.V1Service): void {
    let uid = object.metadata?.uid;
    if (this.ngrokMap.has(uid)) {
      //already exists
      if (object.spec?.type === "LoadBalancer") {
        //modified?
        let target = this.resolveTarget(object);
        if (this.ngrokMap.get(uid)?.target !== target) {
          //changes required
          this.disconnectNgrok(uid, this.ngrokMap.get(object.metadata?.uid))
            .then(() => {
              return this.connectNgrok(uid, {url: "", target: target, name: object.metadata?.name, namespace: object.metadata?.namespace});
            })
            .then((url) => {
              if (url !== undefined) {
                let rmeta = ResourceMetaImpl.createWithPlural("services", object);
                let hostname = url.replace("https://", "");
                let statusPatch = { "loadBalancer": { "ingress": [{ "hostname": hostname }] } };
                return this.patchResourceStatus(rmeta, statusPatch);
              }
            })
            .then((rmeta) => {
              this.log.info("Service status patched: " + object.metadata?.name + "." + object.metadata?.namespace);
            });
        }
        else
          this.log.debug("Already Ngroked!");
      }
      else {
        //modified: remove ngrok
        this.disconnectNgrok(uid, this.ngrokMap.get(object.metadata?.uid))
          .then(() => {
            let rmeta = ResourceMetaImpl.createWithPlural("services", object);
            let statusPatch = { "loadBalancer": { "ingress": [{ "hostname": "not.available" }] } };
            return this.patchResourceStatus(rmeta, statusPatch);
          })
          .then((rmeta) => {
            this.log.info("Service status disconnected: " + object.metadata?.name + "." + object.metadata?.namespace);
          });
      }
    }
    else if (object.spec?.type === "LoadBalancer") {
      //added
      let target = this.resolveTarget(object);
      this.connectNgrok(uid, {url: "", target: target, name: object.metadata?.name, namespace: object.metadata?.namespace})
        .then((url) => {
          if (url !== undefined) {
            let rmeta = ResourceMetaImpl.createWithPlural("services", object);
            let hostname = url.replace("https://", "");
            let statusPatch = { "loadBalancer": { "ingress": [{ "hostname": hostname }] } };
            return this.patchResourceStatus(rmeta, statusPatch);
          }
        })
        .then((rmeta) => {
          this.log.info("Service status patched: " + object.metadata?.name + "." + object.metadata?.namespace);
        });
    }
  }

  private async disconnectNgrok(uid: string | undefined, nc: ngrokConnection | undefined): Promise<void> {
    // ngrok.disconnect() path needs to be safeguarded with a mutex
    this.ngrokMap.delete(uid);
    const release = await mutex.acquire();
    if (nc !== undefined)
      try {
        //must disconnect two urls: https and http.
        await ngrok.disconnect(nc.url);
        await ngrok.disconnect(nc.url?.replace("https", "http"));
        this.log.info(`Ungroked: ${nc.name}.${nc.namespace} disconnected from ${nc.url}`);
      }
      catch (error) {
        this.log.error(error);
        await ngrok.kill();
        this.ngrokMap.clear();
      }
      finally {
        release();
      }
  }

  private async connectNgrok(uid: string | undefined, nc: ngrokConnection): Promise<string | undefined> {
    // ngrok.connect() path needs to be safeguarded with a mutex
    const release = await mutex.acquire();
    try {
      nc.url = await ngrok.connect({
        proto: 'http',
        addr: nc.target,
        onLogEvent: msg => { this.log.debug(msg) },
        onStatusChange: status => { this.log.warn(status) },
      });
      
      this.ngrokMap.set(uid, nc);
      this.log.info(`Ngroked: ${nc.name}.${nc.namespace}/${nc.target} connected to ${nc.url}`);
      return nc.url;
    }
    catch (error) {
      this.log.error(error);
      await ngrok.kill();
      this.ngrokMap.clear();
    }
    finally {
      release();
    }
    return undefined;
  }

  private resolveTarget(object: k8s.V1Service): string {
    let port = 8080
    let portname: string | undefined;

    //annotations exist?
    if (object.metadata!.annotations === undefined)
      portname = undefined;
    else
      portname = object.metadata!.annotations![annotation];

    if (portname !== undefined) {
      //annotation exists
      const portobj = object.spec!.ports!.filter(object => object.name === portname);

      //portmap refernce exists?
      if (portobj !== undefined && portobj.length >= 1) {
        this.log.debug(`Annotation '${annotation}' found. Choosing first portmap: `, portobj[0]);
        port = portobj[0].port;
      }
      else {
        portname = undefined;
        this.log.warn(`Annotation '${annotation}' not found.`);
      }
    }

    if (portname === undefined &&
      object.spec!.ports !== undefined && object.spec!.ports.length >= 1) {
      port = object.spec!.ports[0].port;
      this.log.debug("Defaulting to portmap: ", object.spec!.ports[0]);
    }
    else if (portname === undefined) {
      this.log.warn("Could not associate any port. Defaulting to " + port);
    }

    return object.spec!.clusterIP + ":" + port;
  }
}