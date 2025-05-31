# Cuda For Ubuntu Image Version
FROM nvidia/cuda:12.0.1-cudnn8-runtime-ubuntu20.04

# Install essential libraries for building and installing Python and other dependencies
RUN apt update && \
    apt install -y build-essential zlib1g-dev libncurses5-dev libgdbm-dev libnss3-dev libssl-dev libreadline-dev libffi-dev wget &&\
    apt install -y curl

# Install Python 3.11 (Assuming 3.11 source is available)
WORKDIR /tmp
RUN wget https://www.python.org/ftp/python/3.11.0/Python-3.11.0.tgz && \
    tar -xvf Python-3.11.0.tgz && \
    cd Python-3.11.0 && \
    ./configure && \
    make && \
    make install

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt install -y nodejs

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json and install
COPY package*.json ./
RUN npm install -g nodemon cross-env
RUN npm ci
RUN npm install --production 

# Install Python venv and pip (Note: this might be optional since we installed Python 3.11 already)
RUN python3 -m ensurepip && \
    python3 -m pip install --upgrade pip && \
    python3 -m pip install virtualenv

RUN pip3 install torch torchvision torchaudio && \
    pip3 install transformers && \
    pip3 install pytorch-pretrained-bert && \
    pip3 install peft==0.2.0 && \
    pip3 install tensorboardX && \
    pip3 install scikit-learn


# Copy code
COPY . .

# Expose the port the app runs on
EXPOSE 8280

# Command to run the application
CMD npm run start:widm
