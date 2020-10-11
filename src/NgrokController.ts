import { Logger } from "log4js";
import Operator, { ResourceEventType, ResourceEvent, ResourceMeta, ResourceMetaImpl } from '@dot-i/k8s-operator';
import { setIntervalAsync, clearIntervalAsync, SetIntervalAsyncTimer } from 'set-interval-async/fixed';
import * as k8s from '@kubernetes/client-node';
import ngrok from 'ngrok';

interface ngrokconnection {
  url: string;
  target: string;
  name: string | undefined;
  namespace: string | undefined;
}

export default class NgrokController extends Operator {

  private ngrokMap: Map<string | undefined, ngrokconnection> = new Map<string, ngrokconnection>();
  private reconcileTimer!: SetIntervalAsyncTimer;

  constructor(protected log: Logger) {
    super(log);
  }

  protected async init() {
    // Inittialize timer
    this.reconcileTimer = setIntervalAsync(async () => {
      this.log.debug("reconcileTimer: Running reconcile from timer");
      await this.reconcile();
    }, 60 * 1000);

    await this.watchResource('', 'v1', 'services', async (e) => {
      const object: k8s.V1Service = e.object;

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

  private handleDeleteResource(object: k8s.V1Service): void {
    if (!this.ngrokMap.has(object.metadata?.uid)) {
      this.log.warn("No active Ngrok for this service " + object.metadata?.uid);
      return;
    }

    const uid = object.metadata?.uid;
    const url = this.ngrokMap.get(object.metadata?.uid)?.url;
    this.disconnectNgrok(uid, url)
      .then(() => {
        this.log.info("Ungroked: " + object.metadata?.name + "." + object.metadata?.namespace + " disconnected from " + url);
      });
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
          const durl = this.ngrokMap.get(object.metadata?.uid)?.url;
          this.disconnectNgrok(uid, durl)
            .then(() => {
              this.log.info("Ungroked: " + object.metadata?.name + "." + object.metadata?.namespace + " disconnected from " + durl);
              return this.connectNgrok(uid, target, object.metadata?.name, object.metadata?.namespace);
            })
            .then((url) => {
              if (url !== undefined) {
                let rmeta = ResourceMetaImpl.createWithPlural("services", object);
                let hostname = url.replace("https://", "");
                let statusPatch = { "loadBalancer": { "ingress": [{ "hostname": hostname }] } };
                this.log.info("Ngroked: " + object.metadata?.name + "." + object.metadata?.namespace + " connected to " + url);
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
        const url = this.ngrokMap.get(object.metadata?.uid)?.url;
        this.disconnectNgrok(uid, url)
          .then(() => {
            this.log.info("Ungroked: " + object.metadata?.name + "." + object.metadata?.namespace + " disconnected from " + url);
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
      this.connectNgrok(uid, target, object.metadata?.name, object.metadata?.namespace)
        .then((url) => {
          if (url !== undefined) {
            let rmeta = ResourceMetaImpl.createWithPlural("services", object);
            let hostname = url.replace("https://", "");
            let statusPatch = { "loadBalancer": { "ingress": [{ "hostname": hostname }] } };
            this.log.info("Ngroked: " + object.metadata?.name + "." + object.metadata?.namespace + " connected to " + url);
            return this.patchResourceStatus(rmeta, statusPatch);
          }
        })
        .then((rmeta) => {
          this.log.info("Service status patched: " + object.metadata?.name + "." + object.metadata?.namespace);
        });
    }
  }

  private async disconnectNgrok(uid: string | undefined, url: string | undefined): Promise<void> {
    try {
      //must disconnect two urls: https and http.
      await ngrok.disconnect(url);
      await ngrok.disconnect(url?.replace("https", "http"));
      this.ngrokMap.delete(uid);
    }
    catch (error) {
      this.log.error(error);
      await ngrok.kill();
    }
  }

  private async connectNgrok(uid: string | undefined, target: string, name: string | undefined, namespace: string | undefined): Promise<string | undefined> {
    try {
      const url = await ngrok.connect({
        proto: 'http',
        addr: target,
        onLogEvent: msg => { this.log.debug(msg) },
        onStatusChange: status => { this.log.warn(status) },
      });
      this.ngrokMap.set(uid, { url, target, name, namespace });
      return url;
    }
    catch (error) {
      this.log.error(error);
      await ngrok.kill();
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
      portname = object.metadata!.annotations!['vasu1124/ngrok'];

    if (portname !== undefined) {
      //annotation exists
      const portobj = object.spec!.ports!.filter(object => object.name === portname);

      //portmap refernce exists?
      if (portobj !== undefined && portobj.length >= 1) {
        this.log.info("Annotation 'vasu1124/ngrok' found. Choosing first portmap: ", portobj);
        port = portobj[0].port;
      }
      else {
        portname = undefined;
        this.log.warn("Annotation 'vasu1124/ngrok' not found.");
      }
    }

    if (portname === undefined &&
      object.spec!.ports !== undefined && object.spec!.ports.length >= 1) {
      port = object.spec!.ports[0].port;
      this.log.info("Defaulting to portmap: ", object.spec!.ports[0]);
    }
    else if (portname === undefined) {
      this.log.warn("Could not associate any port. Defaulting to " + port);
    }

    return object.spec!.clusterIP + ":" + port;
  }
}