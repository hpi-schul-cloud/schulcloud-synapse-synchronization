# Cancel implicit rules on top Makefile
$(CURDIR)/Makefile Makefile: ;

SHELL := /bin/bash

GIT_REMOTE_URL ?= $(shell git remote get-url origin)
GIT_COMMIT_SHORT_SHA ?= $(shell git rev-parse --short HEAD)

PROJECT_DIR ?= $(realpath $(dir $(lastword $(MAKEFILE_LIST))))
PROJECT_NAME ?= $(basename $(notdir $(GIT_REMOTE_URL)))

DOCKER_BUILD_OPTIONS ?= --pull --no-cache --force-rm --rm
DOCKER_PUSH_OPTIONS ?=
DOCKER_IMAGE_NAME ?= schulcloud/$(PROJECT_NAME)
DOCKER_IMAGE_TAG ?= $(DOCKER_IMAGE_NAME):$(GIT_COMMIT_SHORT_SHA)

.PHONE: --login
--login:
	docker login

.PHONY: build
build: DOCKER_BUILD_OPTIONS += \
	--file "$(PROJECT_DIR)/Dockerfile" \
	--tag $(DOCKER_IMAGE_TAG)
build:
	docker build $(DOCKER_BUILD_OPTIONS) "$(PROJECT_DIR)"

.PHONY: push
push: DOCKER_PUSH_OPTIONS +=
push: --login
	docker push $(DOCKER_PUSH_OPTIONS) $(DOCKER_IMAGE_TAG)
