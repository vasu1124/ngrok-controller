# -*- mode: Python -*-

# For more on Extensions, see: https://docs.tilt.dev/extensions.html
load('ext://local_output', 'local_output')

default_registry('docker.io/vasu1124')
allow_k8s_contexts(['colima', 'Default'])

docker_build(
  'vasu1124/ngrok-controller', 
  '.', 
  dockerfile='Dev.Dockerfile',
  live_update=[
    sync('./src', '/app/src')
  ]
)

k8s_yaml(kustomize('./kubernetes/ngrok-controller'))
k8s_resource(workload='ngrok-controller', objects=[
    'ngrok-controller:namespace',
    'sa-ngrok-controller:serviceaccount',
    'ngrok-controller:clusterrole',
    'ngrok-controller-crb:clusterrolebinding',
    'ngrok-config:configmap'
  ],
  labels=['ngrok-controller']
)
k8s_resource(
  workload='ngrok-controller', 
  port_forwards=['4040','9229'],
  labels=['ngrok-controller']
)

k8s_yaml(kustomize('./kubernetes/httpbin'))
k8s_resource(workload='httpbin', objects=[
    'test:namespace'
  ],
  labels=['ngrok-controller']
)

# v1alpha1.extension_repo(name='tilt-extensions', url='https://github.com/tilt-dev/tilt-extensions')
# v1alpha1.extension(
#   name='ngrok', 
#   repo_name='tilt-extensions', 
#   repo_path='ngrok',
# )
