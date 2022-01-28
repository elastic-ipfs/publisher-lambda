#!/bin/bash

set -x 
aws logs get-log-events --region $AWS_REGION --log-group-name /aws/lambda/$LAMBDA --log-stream-name $@ | jq -r -M -c '.events[].message | tostring | sub("\\s+$"; "")'