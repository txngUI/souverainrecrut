FROM jenkins/jenkins:lts-jdk21

USER root

# Outils dont la pipeline a besoin :
# - Docker CLI + buildx : docker build / push / scan Trivy (via le daemon de l'hôte)
# - Node.js 22 : npm ci, prisma generate, tests
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
      > /etc/apt/sources.list.d/docker.list \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin nodejs \
 && rm -rf /var/lib/apt/lists/*

# Donne à l'utilisateur jenkins l'accès au socket Docker de l'hôte (même GID que le groupe docker de l'hôte)
ARG DOCKER_GID=963
RUN groupadd -g ${DOCKER_GID} docker-host && usermod -aG docker-host jenkins

USER jenkins

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt