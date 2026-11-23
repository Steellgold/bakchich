# Self-hosted text-to-speech for the judge's voice (Piper, French voice baked into the image).
FROM python:3.12-slim

ENV PIP_NO_CACHE_DIR=1

# Multi-speaker French voice by default (the bot picks speaker 8582 with PIPER_SPEAKER); single-speaker ones: fr_FR-tom-medium, fr_FR-gilles-low, fr_FR-siwis-medium.
ARG PIPER_VOICE=fr_FR-mls-medium
ENV PIPER_VOICE=${PIPER_VOICE}

RUN pip install "piper-tts[http]" "flask>=3,<4"
RUN python3 -m piper.download_voices "${PIPER_VOICE}" --data-dir /voices

EXPOSE 5000
CMD ["sh", "-c", "exec python3 -m piper.http_server -m \"$PIPER_VOICE\" --data-dir /voices --host 0.0.0.0 --port 5000"]
