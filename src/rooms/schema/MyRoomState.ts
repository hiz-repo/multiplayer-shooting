import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") timeStamp: number = 0;
  @type("number") clientTimeOffset: number = 0;
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") velocityX: number = 0;
  @type("number") velocityY: number = 0;
  @type("number") angle: number = 0;
  @type("number") life: number = 20;
}

export class Bullet extends Schema {
  @type("boolean") isActive: boolean = false;
  @type("string") emitterSessionId = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") angle: number = 0;
}

export class MyRoomState extends Schema {
  @type("boolean") flag: boolean = true;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type([ Bullet ]) bullets = new ArraySchema<Bullet>();
}
