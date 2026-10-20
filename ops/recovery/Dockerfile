# Only a reviewed, digest-pinned Debian Bookworm Python image is permitted.
ARG ERS_RECOVERY_BASE_IMAGE
FROM ${ERS_RECOVERY_BASE_IMAGE}
ARG ERS_RECOVERY_BASE_IMAGE
ARG ERS_SOURCE_SHA
LABEL org.opencontainers.image.revision="${ERS_SOURCE_SHA}"
LABEL org.enterpriseremotesystems.recovery.base-image="${ERS_RECOVERY_BASE_IMAGE}"
ENV DEBIAN_FRONTEND=noninteractive PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates coreutils openssl sqlite3 docker.io \
    && rm -rf /var/lib/apt/lists/*
COPY scripts/ers-emergency-admin-recovery.py /opt/ers/scripts/ers-emergency-admin-recovery.py
COPY scripts/ers-emergency-admin-isolated-rehearsal.py /opt/ers/scripts/ers-emergency-admin-isolated-rehearsal.py
COPY scripts/testdata/emergency-recovery-host-probe /opt/ers/scripts/testdata/emergency-recovery-host-probe
COPY ops/recovery/verify.sh /usr/local/bin/ers-gateb-verify
RUN chmod 0755 /usr/local/bin/ers-gateb-verify && \
    python3 -m py_compile /opt/ers/scripts/ers-emergency-admin-recovery.py /opt/ers/scripts/ers-emergency-admin-isolated-rehearsal.py && \
    /usr/local/bin/ers-gateb-verify
WORKDIR /opt/ers
ENTRYPOINT []
CMD ["/usr/local/bin/ers-gateb-verify"]
