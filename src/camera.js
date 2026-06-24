// camera.js — projection + view matrix holder.
import { mat4, perspective, viewFromYawPitch } from './math.js';
import { PLAYER_EYE } from './config.js';

export class Camera {
  constructor() {
    this.fov = 70 * Math.PI / 180;
    this.near = 0.08;
    this.far = 1000;
    this.aspect = 1;
    this.proj = mat4();
    this.view = mat4();
  }
  setAspect(a) { this.aspect = a; }
  updateProj() { perspective(this.proj, this.fov, this.aspect, this.near, this.far); return this.proj; }
  updateView(player) {
    const eye = [player.pos[0], player.pos[1] + PLAYER_EYE, player.pos[2]];
    viewFromYawPitch(this.view, eye, player.yaw, player.pitch);
    this.eye = eye;
    return this.view;
  }
}
