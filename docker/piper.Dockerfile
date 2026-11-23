# Self-hosted text-to-speech for the judge's voice (Piper, French voice baked into the image).
FROM python:3.12-slim

ENV PIP_NO_CACHE_DIR=1

RUN pip install "piper-tts[http]" "flask>=3,<4"
RUN python3 -m piper.download_voices fr_FR-siwis-medium --data-dir /voices

EXPOSE 5000
CMD ["python3", "-m", "piper.http_server", "-m", "fr_FR-siwis-medium", "--data-dir", "/voices", "--host", "0.0.0.0", "--port", "5000"]
