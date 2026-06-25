// camera.js — projection + view matrix holder.
import { mat4, perspective, viewFromYawPitch, dirFromYawPitch } from './math.js';
import { PLAYER_EYE } from './config.js';

const THIRD_PERSON_DIST = 4.0;

export class Camera {
  constructor() {
    this.fov = 70 * Math.PI / 180;
    this.near = 0.08;
    this.far = 1000;
    this.aspect = 1;
    this.perspective = 0;      // 0 first-person, 1 third (behind), 2 third (front)
    this.proj = mat4();
    this.view = mat4();
  }
  setAspect(a) { this.aspect = a; }
  updateProj() { perspective(this.proj, this.fov, this.aspect, this.near, this.far); return this.proj; }

  updateView(player, world) {
    const eye = [player.pos[0], player.pos[1] + PLAYER_EYE, player.pos[2]];
    if (this.perspective !== 0) {
      // back (1): camera behind, looking along player's view; front (2): in front, looking back.
      const front = this.perspective === 2;
      const dir = dirFromYawPitch(player.yaw, player.pitch);
      const rd = front ? [dir[0], dir[1], dir[2]] : [-dir[0], -dir[1], -dir[2]];
      let dist = THIRD_PERSON_DIST;
      if (world && world.raycast) {
        const h = world.raycast(eye, rd, dist + 0.4);
        if (h && h.hit) dist = Math.max(0.4, h.t - 0.3);  // don't clip through walls
      }
      const cam = [eye[0] + rd[0] * dist, eye[1] + rd[1] * dist, eye[2] + rd[2] * dist];
      viewFromYawPitch(this.view, cam, front ? player.yaw + Math.PI : player.yaw, front ? -player.pitch : player.pitch);
      this.eye = cam;
      return this.view;
    }
    viewFromYawPitch(this.view, eye, player.yaw, player.pitch);
    this.eye = eye;
    return this.view;
  }
}
