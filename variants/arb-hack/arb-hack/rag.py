from flask import Flask, request, jsonify
from flask_cors import CORS
import ollama
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import WebBaseLoader
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OllamaEmbeddings
import json
import re
from fuzzywuzzy import process as fuzzy_process

app = Flask(__name__)
CORS(app) 

#Read Files
file_ltipp = open("/home/fair-node/Desktop/arb-hack/ltipp_keys", "r")
content_ltipp = file_ltipp.read()
keys_list_ltipp = [line.strip() for line in content_ltipp.splitlines()]
file_ltipp.close()

file_ltipp_map  = open("/home/fair-node/Desktop/arb-hack/ltipp.json", "r")
ltipp_map = json.load(file_ltipp_map)
file_ltipp_map.close()

def find_closest_match(input_string, array_of_strings):
    closest_match, score = fuzzy_process.extractOne(input_string, array_of_strings)
    return closest_match, score

def get_json_from_llm(string_json_raw):
    json_str = re.search(r'{.*}', string_json_raw, re.DOTALL).group()
    json_data = json.loads(json_str)
    return json_data

def convert_json_to_object(string_json):
    try:
        data = json.loads(string_json)
    except:
        try:
            data = get_json_from_llm(string_json)
        except:
            data = {}
    
    try:    
        keys = data.get('keys',[])
    except:
        keys = []    
    return keys

def convert_keys_into_urls(keys):
    all_urls = []
    for key in keys:
        key_values = ltipp_map.get(key)
        if key_values:
            all_urls.extend(key_values) 
        else:
            closest_key, score = find_closest_match(key,keys_list_ltipp)
            if score != 0:
                new_keys = ltipp_map.get(closest_key)
                all_urls.extend(new_keys)
    return all_urls    
    

def process_and_embeddings(string_json): 
    keys = convert_json_to_object(string_json)
    urls = convert_keys_into_urls(keys)
    urls.append('https://www.openblocklabs.com/research/arbitrum-ltipp-efficacy-analysis') # this is to include the report and provide better answers
    
        
    loader = WebBaseLoader(
        web_paths=(urls),
    )
    docs = loader.load()

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
    splits = text_splitter.split_documents(docs)

    # 2. Create Ollama embeddings and vector store
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    vectorstore = Chroma()
    
    # it's necessary to remove the old context from previous request because Chroma stores that into ephemeral in-memory.
    old_context_ids = vectorstore.get()['ids']
    if old_context_ids:
        vectorstore.delete(ids= old_context_ids)
        
    vectorstore = Chroma.from_documents(documents=splits, embedding=embeddings)
    return vectorstore

# 3. Call Ollama Llama3 model
def ollama_llm(question, context):
    formatted_prompt = f"Using this data: {context}. Answer to this prompt: {question}"
    response = ollama.generate(model='llama3:70b', prompt = formatted_prompt)
    return response['response']
    #response = ollama.chat(model='llama3', messages=[{'role': 'user', 'content': formatted_prompt}])
    #return response['message']['content']

# 3. Call Ollama Llama3 model
def ollama_llm_first_question(question):
    formatted_prompt = f"""For this answer, you will answer a JSON object and only the JSON object Like this:
        {{
    "keys": [
    "key1",
    "key2"
    ]
        }}


    If you think that the question is specific to one or more projects you will find the keys that match the question ,but please give the exact key name form this list:  {content_ltipp}

    Example:
    {{
    "keys": [
    "Aark",
    "Lido"
    ]
        }}

    Use the following question to find the right keys and provide the JSON object: {question}"""
    
    response = ollama.generate(model='llama3', prompt = formatted_prompt)
    return response['response']


# 4. RAG Setup

def retriever_obj(string_json):
    vectorstore = process_and_embeddings(string_json)
    retriever = vectorstore.as_retriever(k=20)
    return retriever
def combine_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

def rag_chain_inference(question):
    first_filter = ollama_llm_first_question(question)
    retriever = retriever_obj(first_filter)
    retrieved_docs = retriever.invoke(question)
    formatted_context = combine_docs(retrieved_docs)
    return ollama_llm(question, formatted_context)

def get_context_from_rag_chain(question):
    first_filter = ollama_llm_first_question(question)
    retriever = retriever_obj(first_filter)
    retrieved_docs = retriever.invoke(question)
    formatted_context = combine_docs(retrieved_docs)
    return formatted_context


