type int = number;

type TDataType = "f32" | "f16" | "ui8";
type TPixelDims = 1 | 2 | 3 | 4;

type TFBO<DataType extends TDataType = TDataType> = {
  glFramebuffer: WebGLFramebuffer;
  glTexture: WebGLTexture;
  width: int;
  height: int;
  pixelDims: TPixelDims;
  dataType: DataType;
};

type TIndexedFBO<DataType extends TDataType = TDataType> = {
  indexDims: int[];
} & TFBO<DataType>;

type TArgs = Record<string, "fbo" | "int" | "float">;
type TCompiledArgs<Args extends TArgs> = {
  [K in keyof Args]: { type: Args[K]; uniformLoc: WebGLUniformLocation };
};
type TPassedArgs<Args extends TArgs> = {
  [K in keyof Args]: Args[K] extends "fbo" ? TFBO : number;
};

type TComputation<Args extends TArgs> = {
  glProgram: WebGLProgram;
  vertexAttribLoc: int;
  args: TCompiledArgs<Args>;
};

type TJSTypedArrayOf<DataType extends TDataType> = DataType extends "f32"
  ? Float32Array
  : DataType extends "f16"
  ? Float32Array
  : DataType extends "ui8"
  ? Uint8Array
  : never;

const createJSTypedArrayOf = <DataType extends TDataType>(
  dataType: TDataType,
  size: int
) =>
  new {
    ["f32"]: Float32Array,
    ["f16"]: Float32Array,
    ["ui8"]: Uint8Array,
  }[dataType](size) as TJSTypedArrayOf<DataType>;

/*
 *
 * Init
 *
 */

export function init(gl: WebGL2RenderingContext) {
  gl.getExtension("OES_texture_float");
  gl.getExtension("EXT_color_buffer_float");

  /*
   *
   * Private functions
   *
   */

  const _compileShader = (
    shaderSource: string,
    shaderType: typeof gl.VERTEX_SHADER | typeof gl.FRAGMENT_SHADER
  ): WebGLShader => {
    console.log(
      `Compiling ${
        shaderType === gl.VERTEX_SHADER ? "vertex shader" : "fragment shader"
      }:
      ${shaderSource}`
    );

    const shader = gl.createShader(shaderType)!;
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
      throw `Could not compile shader:
      ${gl.getShaderInfoLog(shader)}`;
    }

    return shader;
  };

  const _createProgram = (
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader
  ): WebGLProgram => {
    const program = gl.createProgram()!;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      throw `Program failed to link:
      ${gl.getProgramInfoLog(program)}`;
    }

    return program;
  };

  const _fullScreenVertexBuffer = gl.createBuffer();
  const _fullScreenVertexBufferData = new Float32Array([
    -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0,
  ]);
  const _fullScreenVertexShader = _compileShader(
    `#version 300 es
in vec4 position;

void main() {
  gl_Position = position;
}
`,
    gl.VERTEX_SHADER
  );

  /*
   *
   * Public functions
   *
   */

  /**
   * Creates a Framebuffer Object (FBO) that can be used as an output destination or input. An FBO can be thought of as a big 2-dimensional array of "pixels", which are each just a vector of length `dims`.
   * @param {int} width
   * @param {int} height
   * @param {TPixelDims} pixelDims - Number of elements in each "pixel". Can be 1 | 2 | 3 | 4.
   * @param {DataType} dataType - Data type of each "pixel" element. Can be "f32" | "f16" | "ui8".
   * @param {TJSTypedArrayOf<DataType>} initData - Initial data in the FBO. Grouped by rows. Needs to match `dataType` according to these rules: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D#pixels).
   */
  const createFBO = <DataType extends TDataType>(
    width: int,
    height: int,
    pixelDims: TPixelDims,
    dataType: DataType,
    initData?: TJSTypedArrayOf<DataType>
  ): TFBO<DataType> => {
    const glFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, glFramebuffer);
    if (glFramebuffer === null) throw "Failed to create FBO";

    const glTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTexture);
    if (glTexture === null) throw "Failed to create texture";

    // https://registry.khronos.org/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
    const [internalFormat, format, size] = {
      ["f32"]: {
        [1]: [gl.R32F, gl.RED, gl.FLOAT],
        [2]: [gl.RG32F, gl.RG, gl.FLOAT],
        [3]: [gl.RGB32F, gl.RGB, gl.FLOAT],
        [4]: [gl.RGBA32F, gl.RGBA, gl.FLOAT],
      },
      ["f16"]: {
        [1]: [gl.R16F, gl.RED, gl.HALF_FLOAT],
        [2]: [gl.RG16F, gl.RG, gl.HALF_FLOAT],
        [3]: [gl.RGB16F, gl.RGB, gl.HALF_FLOAT],
        [4]: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
      },
      ["ui8"]: {
        [1]: [gl.R8, gl.RED, gl.UNSIGNED_BYTE],
        [2]: [gl.RG8, gl.RG, gl.UNSIGNED_BYTE],
        [3]: [gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE],
        [4]: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
      },
    }[dataType][pixelDims];

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      width,
      height,
      0,
      format,
      size,
      initData ?? null
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      glTexture,
      0
    );

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw "Framebuffer is incomplete: " + status;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
      glFramebuffer,
      glTexture,
      width,
      height,
      dataType,
      pixelDims: pixelDims,
    };
  };

  /**
   * Creates an FBO that models an N-dimensional array (tensor) of `indexDims`. Each root element in this array is a "pixel" of size `pixelDims`.
   * @param {int[]} indexDims - Size of each dimension of the array.
   * @param {TPixelDims} pixelDims - Number of elements in "pixel". Can be 1 | 2 | 3 | 4.
   * @param {DataType} dataType - Data type of each "pixel" element. Can be "f32" | "f16" | "ui8".
   * @param {TJSTypedArrayOf<DataType>} initData - Initial data in the FBO. Needs to match `dataType` according to these rules: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D#pixels).
   */
  const createIndexedFBO = <DataType extends TDataType>(
    indexDims: int[],
    pixelDims: TPixelDims,
    dataType: DataType,
    initData?: TJSTypedArrayOf<DataType>
  ): TIndexedFBO<DataType> => {
    const arrayLength = indexDims.reduce((acc, v) => acc * v);

    const flatWidth = Math.ceil(Math.sqrt(arrayLength));
    let flatHeight = flatWidth;
    while (flatWidth * flatHeight >= arrayLength) {
      flatHeight--;
    }
    flatHeight++;

    return {
      indexDims,
      ...createFBO(flatWidth, flatHeight, pixelDims, dataType, initData),
    };
  };

  /**
   * Reads raw data from the FBO into a flat TypedArray.
   * @param {TFBO<DataType>} fbo
   * @param {TJSTypedArrayOf<DataType>} [out] - Optional. TypedArray to read data into. If none is provided, a new one is created. Needs to match `fbo`'s data type according to these rules: [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/readPixels#pixels).
   * @returns {TJSTypedArrayOf<DataType>} `out` if provided. Otherwise, the newly created TypedArray.
   */
  const readFBORaw = <DataType extends TDataType>(
    fbo: TFBO<DataType>,
    out: TJSTypedArrayOf<DataType> = createJSTypedArrayOf(
      fbo.dataType,
      fbo.width * fbo.height * fbo.pixelDims
    )
  ): TJSTypedArrayOf<DataType> => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.glFramebuffer);

    gl.readPixels(
      0,
      0,
      fbo.width,
      fbo.height,
      {
        [1]: gl.RED,
        [2]: gl.RG,
        [3]: gl.RGB,
        [4]: gl.RGBA,
      }[fbo.pixelDims],
      {
        ["f32"]: gl.FLOAT,
        ["f16"]: gl.HALF_FLOAT,
        ["ui8"]: gl.UNSIGNED_BYTE,
      }[fbo.dataType],
      out
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return out;
  };

  // Adapted from the built-in `FlatArray` type
  // prettier-ignore
  type TNDArray<T, Depth extends number> = {
    done: T;
    recur: TNDArray<T, [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20][Depth]>[]
  }[Depth extends 0 ? "done" : "recur"];

  /**
   * Reads data from the FBO and formats it as an N-dimensional array of "pixels".
   *
   * (TS only) Requires explicitly passing in `ArrayDepth` since it can't be inferred.
   * @param {TBaseFBO<DataType, Dims>} fbo
   */
  const readFBOStructured = <
    DataType extends TDataType,
    ArrayDepth extends int = 2
  >(
    fbo: TIndexedFBO<DataType> | TFBO<DataType>
  ): TNDArray<TJSTypedArrayOf<DataType>, ArrayDepth> => {
    const rawData = readFBORaw(fbo);

    const rawPixels = new Array<TJSTypedArrayOf<DataType>>(
      rawData.length / fbo.pixelDims
    );
    for (let i = 0; i < rawPixels.length; i++) {
      const pixel = createJSTypedArrayOf(fbo.dataType, fbo.pixelDims);
      for (let j = 0; j < fbo.pixelDims; j++) {
        pixel.set([rawData[i * fbo.pixelDims]], j);
      }
    }

    const dims = "indexDims" in fbo ? fbo.indexDims : [fbo.width, fbo.height];

    return dims.reduceRight((acc: any[], dim) => {
      const out = [];
      for (let i = 0; i < acc.length / dim; i++) {
        out.push(acc.slice(i * dim, (i + 1) * dim));
      }
      return out;
    }, rawPixels) as any; // Return type requires `dims.length` as a constant. However, `TIndexedFBO.indexDims` is defined as just `number[]`, so its `length` property is at best `number`.
  };

  /**
   * Compiles a WebGL program that represents a computation using the given args. Can then be run using `runComputation` with any args and output target.
   * @param {Args} args - Arguments that are used in the computation of each "pixel" value.
   * @param {string} fragmentShaderBody - A block of GLSL code that ultimately sets the `fragColor` variable to the intended output value for each "pixel". Passed directly into the fragment shader's `main()` function.
   * @param {string} fragmentShaderHelpers - A block of GLSL code that defines helper functions to be used by `fragmentShaderBody`. Passed directly into the fragment shader between the `main()` function and the uniform definitions.
   */
  const createComputation = <Args extends TArgs>(
    args: Args,
    fragmentShaderBody: string,
    fragmentShaderHelpers: string = ""
  ): TComputation<Args> => {
    const glProgram = _createProgram(
      _fullScreenVertexShader,
      _compileShader(
        /* GLSL */ `#version 300 es
precision highp float;

out vec4 fragColor;
${Object.entries(args)
  .map(
    ([name, type]) => `
uniform ${type === "fbo" ? "sampler2D" : type} ${name};`
  )
  .join("")}
${fragmentShaderHelpers}
void main() {
    ${fragmentShaderBody}
}
      `,
        gl.FRAGMENT_SHADER
      )
    );

    return {
      glProgram,
      args: Object.fromEntries(
        Object.entries(args).map(([name, type]) => [
          name,
          { type, uniformLoc: gl.getUniformLocation(glProgram, name)! },
        ])
      ) as TCompiledArgs<Args>,
      vertexAttribLoc: gl.getAttribLocation(glProgram, "position"),
    };
  };

  /**
   * Runs the given `computation` with the given `args` and stores the result in `outputFBO`.
   * @param {TComputation<Args>} computation
   * @param {TBaseFBO | "canvas"} outputFBO - Target to store the computation result in. Will run the fragment shader for every "pixel" in `outputFBO`. Can also output directly to the WebGL context's source canvas.
   * @param {TPassedArgs<Args>} args - Arguments to pass into the computation.
   */
  const runComputation = <Args extends TArgs>(
    computation: TComputation<Args>,
    outputFBO: TFBO | "canvas",
    args: TPassedArgs<Args>
  ) => {
    gl.useProgram(computation.glProgram);

    gl.bindFramebuffer(
      gl.FRAMEBUFFER,
      outputFBO === "canvas" ? null : outputFBO.glFramebuffer
    );
    gl.viewport(
      0,
      0,
      outputFBO === "canvas" ? gl.canvas.width : outputFBO.width,
      outputFBO === "canvas" ? gl.canvas.height : outputFBO.height
    );

    let texturesUsed = 0;
    for (const [name, { type, uniformLoc }] of Object.entries(
      computation.args
    )) {
      if (type === "fbo") {
        gl.activeTexture(gl.TEXTURE0 + texturesUsed);
        gl.bindTexture(gl.TEXTURE_2D, (args[name] as TFBO).glTexture);
        gl.uniform1i(uniformLoc, texturesUsed);
        texturesUsed++;
      } else if (type === "float") {
        gl.uniform1f(uniformLoc, args[name] as number);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, _fullScreenVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, _fullScreenVertexBufferData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(computation.vertexAttribLoc);
    gl.vertexAttribPointer(
      computation.vertexAttribLoc,
      2,
      gl.FLOAT,
      false,
      0,
      0
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  /**
   * Common GLSL patterns for the fragment shader.
   */
  const MACROS = {
    fbo_idx: (name: string, x: string, y: string) =>
      `texelFetch(${name}, ivec2(${x}, ${y}), 0)`,
    // my_x: () => `gl_FragCoord.x - 0.5`,
    // my_y: () => `gl_FragCoord.y - 0.5`,
    fbo_idx_myxy: (name: string) =>
      `texelFetch(${name}, ivec2(gl_FragCoord.x, gl_FragCoord.y), 0)`,
    indexed_fbo_idx: <FBO extends TIndexedFBO>(
      name: string,
      fbo: FBO,
      index: FBO["indexDims"]
    ) =>
      `texelFetch(${name}, ivec2((${
        index.reduceRight<[string, number]>(
          ([sumStr, chunkSize], dim, i) => [
            `${sumStr} + ${dim * chunkSize}`,
            chunkSize * fbo.indexDims[i],
          ],
          ["0", 1]
        )[0]
      }) % ${fbo.width}, ${
        index.reduceRight<[string, number]>(
          ([sumStr, chunkSize], dim, i) => [
            `${sumStr} + ${dim * chunkSize}`,
            chunkSize * fbo.indexDims[i],
          ],
          ["0", 1]
        )[0]
      } / ${fbo.width}), 0)`,
  };

  return {
    createFBO,
    createIndexedFBO,
    readFBORaw,
    readFBOStructured,
    createComputation,
    runComputation,
    MACROS,
  };
}
