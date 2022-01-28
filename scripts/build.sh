#!/bin/bash

set -x -e

# Prepare
SRC=$PWD
ROOT=$(mktemp -d)
cp src/* package.json $ROOT

# Install dependencies
cd $ROOT
npm install --production

# Pack the function
zip -qr lambda.zip .

# Copy to the dist folder
cd $SRC
mkdir -p dist
cp $ROOT/lambda.zip $SRC/dist


# Cleanup
rm -rf $ROOT