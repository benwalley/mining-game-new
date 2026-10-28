import { CHUNK_SIZE } from './constants';

/** Tracks the bounding box of changed tiles inside one chunk, in local coords. */
export class DirtyRect {
  minX = CHUNK_SIZE;
  minY = CHUNK_SIZE;
  maxX = -1;
  maxY = -1;

  get isEmpty(): boolean {
    return this.maxX < this.minX;
  }

  add(lx: number, ly: number): void {
    if (lx < this.minX) this.minX = lx;
    if (ly < this.minY) this.minY = ly;
    if (lx > this.maxX) this.maxX = lx;
    if (ly > this.maxY) this.maxY = ly;
  }

  addAll(): void {
    this.minX = 0;
    this.minY = 0;
    this.maxX = CHUNK_SIZE - 1;
    this.maxY = CHUNK_SIZE - 1;
  }

  clear(): void {
    this.minX = CHUNK_SIZE;
    this.minY = CHUNK_SIZE;
    this.maxX = -1;
    this.maxY = -1;
  }
}
