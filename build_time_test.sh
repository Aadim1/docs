#!/bin/bash

# Set the start time
start_time=$(date +%s)

# Run the build command and suppress the output
npm run build

# Get the end time
end_time=$(date +%s)

# Calculate the build time in seconds
build_time=$((end_time - start_time))

# Print the timer
printf "Build time: "
minutes=$((build_time / 60))
seconds=$((build_time % 60))
printf "%02d:%02d\n" $minutes $seconds
printf "\n"
