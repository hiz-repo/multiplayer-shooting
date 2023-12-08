import { Room, Client } from "colyseus";
import { MyRoomState, Bullet, Player} from "./schema/MyRoomState";

export class MyRoom extends Room<MyRoomState> {
  maxClients = 2
  patchRate = 1000 / 60;

  onCreate (options: any) {
    this.setState(new MyRoomState());

    this.onMessage("player", (client: Client, input: any) => {
      const player = this.state.players.get(client.sessionId);
      const velocity = 8;
      if(input.W) {
        player.y -= velocity;
      } else if (input.S) {
        player.y += velocity;
      }
      if(input.A) {
        player.x -= velocity;
      } else if (input.D) {
        player.x += velocity;
      }
      const rawAngle = Math.atan2(input.pointerY - input.y, input.pointerX - input.x) * (180 / Math.PI)
      player.angle = rawAngle > 90 ? rawAngle - 270 : rawAngle + 90;
      player.timeStamp = Date.now();
      if(input.isFired) {
        const newBullet = new Bullet();
        newBullet.isActive = true;
        newBullet.emitterSessionId = client.sessionId;
        newBullet.x = input.x;
        newBullet.y = input.y;
        newBullet.angle = player.angle < -90 ? player.angle + 270 : player.angle - 90;
        this.state.bullets.push(newBullet);
      }
    });
    this.onMessage("hit", (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      player.life--;
    });
    this.onMessage('ping', (client: Client, pingStartedTime: number) => {
      const pingReceivedTime = Date.now();
      client.send('pong', {
        env: process.env.NODE_ENV === "development",
        pingReceivedTime: pingReceivedTime
      });
    });
    this.onMessage('pang', (client: Client, latency: number) => {
      const pongReceivedTime = Date.now();
      const player = this.state.players.get(client.sessionId);
      player.clientTimeOffset = pongReceivedTime + latency;
    });
  }

  onJoin (client: Client, options: any) {
    console.log("Client", client.sessionId, "joined to Room", this.roomId);
    const player = new Player();
    player.x = (()=>{
      let i = 200;
      this.state.players.forEach((p, s) => {
        if(s !== client.sessionId) {
          i = (p.x === 200 ? 600 : 600);
        }
      });
      return i;
    })();
    player.y = 300;
    player.angle = (player.x === 200) ? 90 : -90;
    player.timeStamp = Date.now();
    this.state.players.set(client.sessionId, player);
    if(this.state.players.size === 2) {
      console.log("Battle started at Room", this.roomId);
      this.broadcast("start", "Ready!", { afterNextPatch: true});
    }
  }

  onLeave (client: Client, consented: boolean) {
    console.log("Client", client.sessionId, "left.");
    this.lock();
    this.state.players.delete(client.sessionId);
  }

  onDispose() {
    console.log("Room", this.roomId, "disposing...");
  }

}
