DOCKERREPO:=vasu1124

all: ${DOCKERREPO}/ngrok-controller

npm: src/main.ts src/ngrokoperator.ts
	tsc

.PHONY: vasu1124/contrapture
vasu1124/ngrok-controller: Dockerfile
	docker build -f Dockerfile \
		-t="${DOCKERREPO}/ngrok-controller" \
		.

# we are only pushing alpine
.PHONY: docker-push
docker-push: ngrok/ngrok.docker
	docker push ${DOCKERREPO}/ngrok-controller
