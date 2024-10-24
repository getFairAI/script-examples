from ollama import chat
from flask import Flask, request, jsonify
from flask_cors import CORS
import ollama
import bs4
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import WebBaseLoader
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OllamaEmbeddings
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from llama_index.readers.web import BeautifulSoupWebReader
import sys
import json
import re
from fuzzywuzzy import process as fuzzy_process

from prompts import get_prompt_by_question
from rag import rag_chain_inference
import requests
import random

app = Flask(__name__)
CORS(app) 

runpod_id = 'twly873yxbkmmx' #replace with your runpod id or use the same approach as the file 'rag.py' to run the models on your own machine
url = f"https://{runpod_id}-11434.proxy.runpod.net/api/generate"

# Data to send in the POST request

def create_request(question,context):
    return {
        "model": "llama3.1:405b",
        "prompt":  f"Using this data: {context}. Answer to this prompt: {question}" if context else question,
        "stream": False
    }

questions_map = {
    0: 'What is the relationship between the number of ARBs that projects requested and their success in the LTIPP program?',
    1: 'What is the relationship between the categories in which projects fall and their results in the LTIPP program?',
    2: 'What are the top 5 projects that have achieved success based on what they specified in their grant proposals?',
    3: 'What do the most successful projects have in common, considering the objectives they set in their grants?',
    4: 'How does DeltaPrime perform compared to similar projects?'
}    


def ollama_llm(question,context):
    data = create_request(question,context)
    response = requests.post(url, json=data)
    response_data = response.json()
    return response_data.get('response', 'No response found.')


def generate_report():
    results = ""
    for i in range(len(questions_map)):
        question = questions_map[i]
        try:
            answer = ollama_llm(get_prompt_by_question(i),'')
            results += f"** {question} ** </p><br>"
            results += f"{answer} </p><br><br>" 
        except:
            results += f"** {question}** </p> Answer: It was not possible to generate this answer due to a temporary issue </p><br>" 
    
    return results


def generate_report_cache():  #In case you want to use cache and not generate a new report everytime
    random_number = random.randint(0, 4)
    
    filename = f"/home/fair-node/Desktop/arb-hack/reports_cache/report{random_number}.txt"
    
    try:
        with open(filename, 'r', encoding='utf-8') as file:
            content = file.read()
        return content
    except FileNotFoundError:
        return f"Error: {filename} not found."
    except Exception as e:
        return f"Error while reading the file: {str(e)}"
    


# test
@app.route('/')
def home():
    response = generate_report_cache()
    #response = rag_chain_inference('Give me a short description of the project DeltaPrime')
    return response

@app.route('/process', methods=['POST'])
def process():
    data = request.get_json()
    prompt = data.get('prompt', '')
    question_type = data.get('type', '') #report or open
    answer = generate_report_cache() if question_type == 'report' else rag_chain_inference(prompt)

    full_answer = {
        'answer': answer
    }
    return jsonify(full_answer)


if __name__ == '__main__':
    app.run(debug=True, port=8086)
