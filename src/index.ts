require('dotenv').config();
import { Server } from "colyseus";
import { createServer } from "http";
const port = Number(process.env.PORT) || 3000;
import { monitor } from "@colyseus/monitor";
import { MyRoom } from "./rooms/MyRoom";
import express from 'express';
import { Request, Response, NextFunction } from 'express';
import path from 'path';
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/public')));

app.get("/", (req: Request, res: Response) => {
    res.sendFile(__dirname + "/public/index.html");
});

const basicAuth = (req: Request, res: Response, next: NextFunction) => {
    if (req.headers['authorization']) { 
      const authorization = req.headers['authorization']
      const pieces = authorization.split(/\s+/g) 
      const [type] = pieces

      if (type === 'Basic') { 
        const buffer = Buffer.from(pieces[1], 'base64')
        const credentials = buffer.toString()
        const [username, password] = credentials.split(':')

        if ( username === 'admin' && password === process.env.MONITOR_PASSWORD ) { 
          next();
          return
        }
      }
    }
    res.set('WWW-Authenticate', 'Basic realm="realm"')
    res.status(401).end()

};

app.use("/colyseus", basicAuth, monitor());

const gameServer = new Server({
  server: createServer(app)
});

gameServer.define('room', MyRoom);
gameServer.listen(port);
console.log(`Listening on ws://localhost:${ port }`);
