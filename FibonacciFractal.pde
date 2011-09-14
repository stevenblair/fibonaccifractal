/**
 * 3D Fibonacci fractal visualisation
 *
 * Copyright (c) 2011 Steven Blair
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

final float GOLDEN = 1.6180339887498948482045868343656;
final float ROOT_FIVE = 2.2360679774997896964091736687313;

final int WIDTH = 800;
final int HEIGHT = 600;
final int MODE_BOX = 0;
final int MODE_WIREFRAME = 1;

int mode;
int number = 1;
float newScale = 1.0;
boolean zoomOverride = false;
boolean update = true;
float fov = 0.025;
float cameraY = HEIGHT / 2.0;
float cameraZ = cameraY / tan(fov / 2.0);
float aspect = float(WIDTH) / float(HEIGHT);

int fib(int n) {
  return int((pow(GOLDEN, n) - pow(-1 / GOLDEN, n)) / ROOT_FIVE);
}


void setup() {
  size(WIDTH, HEIGHT, P3D);
  frameRate(60);

  modeBox();

  addMouseWheelListener(new java.awt.event.MouseWheelListener() { 
    public void mouseWheelMoved(java.awt.event.MouseWheelEvent evt) { 
      mouseWheel(evt.getWheelRotation());
    }
  }
  );
}


void draw() {
  lights();
  //directionalLight(255, 214, 92, 0, 0, -1);

  if (update == true) {
    background(204);

    perspective(fov, aspect, cameraZ / 10.0, cameraZ * 10.0);
    translate(width / 2, height / 2, 0);
    rotateY(mouseX/float(width) * PI);
    rotateX(mouseY/float(height) * PI);
    scale(newScale);

    float newWidth = 0;
    float prevWidth = 0;
    float prevPrevWidth = 0;
    boolean cancelUpdate = false;

    for (int i = 1; i <= number; i++) {
      if (i < 3) {
        newWidth = 1;
      }
      else {
        newWidth = prevWidth + prevPrevWidth;
      }

      float zOffset = -(newWidth - prevWidth) / 2;

      if (i == 1) {
        // do nothing
      }
      else if ((i - 4) % 4 == 0) {
        translate(-(prevWidth + prevPrevWidth / 2), prevPrevWidth / 2, zOffset);
      }
      else if ((i - 3) % 4 == 0) {
        translate(-prevPrevWidth / 2, -(prevWidth + prevPrevWidth / 2), zOffset);
      }
      else if ((i - 2) % 4 == 0) {
        translate(prevWidth + prevPrevWidth / 2, -prevPrevWidth / 2, zOffset);
      }
      else if ((i - 1) % 4 == 0) {
        translate(prevPrevWidth / 2, prevWidth + prevPrevWidth / 2, zOffset);
      }

      try {
        box(newWidth);
      }
      catch (Exception e) {
        // needed in wireframe mode
      }

      prevPrevWidth = prevWidth;
      prevWidth = newWidth;
      //println(newScale * newWidth * 50 + "       " + width);

      if (newScale * newWidth * 100 > width || newScale * newWidth * 100 > height) {
        if (zoomOverride == false) {
          newScale = newScale + 0.01 * newScale * -1;
        }
      }
      else if (i == number) {
        cancelUpdate = true;
      }
    }

    if (cancelUpdate == true || zoomOverride == true) {
      noUpdate();
    }
  }
}


void update() {
  update = true;
  loop();
}

void noUpdate() {
  update = false;
  noLoop();
}

void mouseMoved() {
  update();
}

void mouseWheel(int delta) {
  update();

  if (delta == -1) {
    zoomOverride = true;
  }

  newScale = newScale + 0.1 * newScale * -1 * delta;
}

void mousePressed() {
  update();

  if (mouseButton == LEFT) {
    number++;
    zoomOverride = false;
  }
  else if (mouseButton == RIGHT && number > 0) {
    number--;

    //TODO: restore scaling?
  }
}

void modeBox() {
  mode = MODE_BOX;

  noSmooth();
  noStroke();
  fill(100, 100, 100, 50);
}

void modeWireframe() {
  mode = MODE_WIREFRAME;

  noFill();
  stroke(0.5);
  smooth();
}

void keyPressed() {
  if (mode == MODE_WIREFRAME) {
    modeBox();
  }
  else {
    modeWireframe();
  }

  update();
}
