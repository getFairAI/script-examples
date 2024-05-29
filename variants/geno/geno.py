from ollama import chat
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 

@app.route('/process', methods=['POST'])
def process():
    data = request.get_json()
    messages = data.get('messages', [])
    response = chat('llama3', messages = messages)
    
    # append the response to messages to answer the full history
    messages.append(response['message'])
    
    #create full answer, history and the real answer
    full_answer = {
        'messages': messages,
        'answer': response['message']['content']
    }

    return jsonify(full_answer)

if __name__ == '__main__':
    app.run(debug=True)
