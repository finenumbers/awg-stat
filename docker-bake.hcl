variable "REGISTRY" {
  default = "ghcr.io"
}

variable "IMAGE_OWNER" {
  default = "finenumbers"
}

group "default" {
  targets = ["app", "poller", "migrate"]
}

target "app" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "runner"
  platforms  = ["linux/amd64"]
  tags = ["${REGISTRY}/${IMAGE_OWNER}/awg-stat:latest"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/finenumbers/awg-stat"
    "org.opencontainers.image.title"  = "awg-stat"
  }
}

target "poller" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "poller"
  platforms  = ["linux/amd64"]
  tags = ["${REGISTRY}/${IMAGE_OWNER}/awg-stat-poller:latest"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/finenumbers/awg-stat"
    "org.opencontainers.image.title"  = "awg-stat-poller"
  }
}

target "migrate" {
  context    = "."
  dockerfile = "Dockerfile"
  target     = "migrator"
  platforms  = ["linux/amd64"]
  tags = ["${REGISTRY}/${IMAGE_OWNER}/awg-stat-migrate:latest"]
  labels = {
    "org.opencontainers.image.source" = "https://github.com/finenumbers/awg-stat"
    "org.opencontainers.image.title"  = "awg-stat-migrate"
  }
}
