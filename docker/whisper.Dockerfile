# Speech-to-text for the hearings: whisper.cpp server with a multilingual model built into the image.
# The bot sends it 16 kHz mono WAV utterances and keeps only the text; no audio is ever stored.
FROM ghcr.io/ggml-org/whisper.cpp:main

# Multilingual model (no ".en" suffix) for French: base is light on a CPU, small is more accurate but slower.
ARG WHISPER_MODEL=base
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN mkdir -p /models && ./models/download-ggml-model.sh "$WHISPER_MODEL" /models

EXPOSE 8080
ENTRYPOINT []
CMD ["sh", "-c", "exec /app/build/bin/whisper-server --host 0.0.0.0 --port 8080 -m \"/models/ggml-$WHISPER_MODEL.bin\" -l fr -nt"]
