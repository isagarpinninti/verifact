# Self-hosted Verifact verifier + Provenance Studio.
#   docker build -t verifact .
#   docker run -p 4319:4319 -e VERIFACT_API_KEY=change-me -v "$PWD/my-evidence:/project" verifact
FROM node:22-alpine
ARG VERIFACT_VERSION=latest
RUN npm install -g @verifact/cli@${VERIFACT_VERSION} && addgroup -S vp && adduser -S vp -G vp
USER vp
WORKDIR /project
EXPOSE 4319
# The server refuses to bind 0.0.0.0 without VERIFACT_API_KEY (or keys from `verifact auth add-key`).
CMD ["verifact", "studio", "/project", "--host", "0.0.0.0", "--port", "4319"]
