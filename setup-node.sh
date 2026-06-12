#!/bin/bash
set -e
NODE_VERSION="v20.11.0"
INSTALL_DIR="/Users/kiran/node-v20"

if [ -f "$INSTALL_DIR/bin/node" ]; then
  echo "Node.js $NODE_VERSION is already installed at $INSTALL_DIR"
  exit 0
fi

echo "Downloading Node.js $NODE_VERSION..."
curl -o /tmp/node.tar.gz "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-darwin-arm64.tar.gz"

echo "Extracting Node.js..."
mkdir -p "$INSTALL_DIR"
tar -xzf /tmp/node.tar.gz -C "$INSTALL_DIR" --strip-components=1

echo "Cleaning up..."
rm /tmp/node.tar.gz

echo "Node.js installation completed successfully!"
"$INSTALL_DIR/bin/node" -v
"$INSTALL_DIR/bin/npm" -v
