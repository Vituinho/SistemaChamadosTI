from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


@app.route("/")
def inicio():
    return jsonify({
        "mensagem": "API Givova TI funcionando!"
    })


@app.route("/teste")
def teste():
    return jsonify({
        "status": "ok",
        "sistema": "Givova TI"
    })


@app.route("/chamados", methods=["POST"])
def criar_chamado():
    dados = request.json

    print("Novo chamado recebido:")
    print(dados)

    return jsonify({
        "mensagem": "Chamado recebido com sucesso!",
        "chamado": dados
    }), 201


if __name__ == "__main__":
    app.run(debug=True)