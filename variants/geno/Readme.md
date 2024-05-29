# Instructions on how to run Geno AI solution

## Notes

This script was tested with Ubuntu 22.04 LTS, with the model running on an NVIDIA GPU. It should work in other environments, but some tweaks may be necessary in the following steps.


## Dependencies

1. You need to install Python, this script was tested with Python 3.12.3

2. Download and install Ollama, for that go to https://ollama.com/download and choose the most suitable version for your machine.

3. Now you need to download the model for your local machine for that using a terminal

```sh
# For this solution we are using the llama3 model 
ollama pull llama3
```
4. Create a virtual environment 

```sh
conda create --name geno-env
```

5. Activate the virtual environment 

```sh
conda activate geno-env
```

6. Install the Ollama python libray. This won't work if you don't have the ollama installed in your machine (step 2)

```sh
pip install ollama
```

7. Install Flask to run the local server

```sh
pip install Flask
```

8. Install flask-cprs

```sh
pip install flask-cors
```

9. Run geno.py to start running the server

```sh
python geno.py
```