FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NVM_DIR=/root/.nvm
ENV NVM_VERSION=v0.40.3
ENV DEFAULT_NODE_VERSION=20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    tar \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install NVM + default Node version
RUN curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/${NVM_VERSION}/install.sh | bash \
    && . "$NVM_DIR/nvm.sh" \
    && nvm install ${DEFAULT_NODE_VERSION} \
    && nvm alias default ${DEFAULT_NODE_VERSION} \
    && nvm use default

# Make nvm and node available globally in all shells
ENV PATH="$NVM_DIR/versions/node/v${DEFAULT_NODE_VERSION}/bin:$PATH"

WORKDIR /home/app

COPY package*.json ./
RUN . "$NVM_DIR/nvm.sh" && npm install

COPY main.sh script.js ./
RUN chmod +x main.sh

ENTRYPOINT ["/bin/bash", "/home/app/main.sh"]
