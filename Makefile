DOCKERREPO:=vasu1124

all: ngrok-controller

.PHONY: ngrok-controller
ngrok-controller: Prod.Dockerfile
	docker build -f Prod.Dockerfile \
		-t="${DOCKERREPO}/ngrok-controller" \
		--progress=plain \
		.

# we are only pushing alpine
.PHONY: docker-push
docker-push: ngrok-controller
	docker push ${DOCKERREPO}/ngrok-controller
