const WebSocket = require('ws');

// Render te proporcionará el puerto a través de una variable de entorno.
// Si no existe, usamos 8080 para pruebas locales.
const PORT = process.env.PORT || 8080;

const server = new WebSocket.Server({ port: PORT });

let tabletSocket = null;
let visorSocket = null;

console.log(`Servidor WebSocket iniciado en el puerto ${PORT}`);

function heartbeat() {
  this.isAlive = true;
}

server.on('connection', (ws) => {
  console.log('Cliente conectado.');
  
  // Mecanismo para mantener la conexión viva
  ws.isAlive = true;
  ws.on('pong', heartbeat); // El cliente responde a nuestro 'ping'

  ws.on('message', (message) => {
    // Si el mensaje es binario (video), lo reenviamos directamente sin procesar.
    if (Buffer.isBuffer(message)) {
        if (ws === tabletSocket && visorSocket) {
            visorSocket.send(message);
        }
        return;
    }

    try {
        const data = JSON.parse(message);

        if (data.type === 'identify') {
            if (data.client === 'tablet') {
                console.log('Tablet identificada.');
                tabletSocket = ws;
            } else if (data.client === 'visor') {
                console.log('Visor identificado.');
                visorSocket = ws;
            }
        } else if (ws === visorSocket && tabletSocket) {
             // Es un comando del visor (tap, swipe), lo reenviamos a la tablet.
            tabletSocket.send(message);
        }
    } catch (e) {
        console.error('Mensaje no es JSON o error de procesamiento:', message.toString(), e);
    }
  });

  ws.on('close', () => {
    console.log('Cliente desconectado.');
    if (ws === tabletSocket) {
      tabletSocket = null;
      console.log('La tablet se ha desconectado.');
    }
    if (ws === visorSocket) {
      visorSocket = null;
      console.log('El visor se ha desconectado.');
    }
  });

  ws.on('error', (error) => {
      console.error('Error en WebSocket:', error);
  });
});

// Intervalo para verificar conexiones y evitar que Render ponga el servicio a dormir.
const interval = setInterval(() => {
  server.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Cliente inactivo, terminando conexión.');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {}); // Envía un ping a cada cliente
  });
}, 30000); // Cada 30 segundos

server.on('close', () => {
  clearInterval(interval);
});
