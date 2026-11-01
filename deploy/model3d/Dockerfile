# syntax=docker/dockerfile:1.7
# PRIVATE registry only: this image contains approved DINOv3 weights.
FROM runpod/pytorch:1.5.0-cu1281-torch280-ubuntu2404
ARG TRELLIS_COMMIT=75fbf0183001ed9876c8dbb35de6b68552ee08bd
ENV TRELLIS_COMMIT=$TRELLIS_COMMIT HF_HOME=/opt/hf TORCH_CUDA_ARCH_LIST=12.0 MAX_JOBS=8 CPLUS_INCLUDE_PATH=/usr/include/eigen3
RUN apt-get update -qq && apt-get install -y --no-install-recommends git build-essential libeigen3-dev libgl1 libglib2.0-0 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --recursive https://github.com/microsoft/TRELLIS.2.git /opt/TRELLIS.2 && cd /opt/TRELLIS.2 && git checkout "$TRELLIS_COMMIT" && git submodule update --init --recursive
WORKDIR /opt/TRELLIS.2
COPY deploy/model3d/build-cuda.sh /tmp/build-cuda.sh
RUN bash /tmp/build-cuda.sh
COPY services/model3d/ /opt/model3d/
RUN --mount=type=secret,id=hf_token,required=true python /opt/model3d/prepare_weights.py && python -m pip freeze > /opt/model3d/requirements-frozen.txt
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONPATH=/opt/TRELLIS.2:/opt/model3d
ENTRYPOINT ["bash","/opt/model3d/entrypoint.sh"]
