# WebGL Compute

WebGL Compute (or `glc` for short) is a extremely lightweight module that lets you run massive parallel computations on the GPU directly from your browser! It aims to abstract as much of the library-specific nuances of WebGL as possible so you can just focus on writing computations!

# Data Types

`glc` introduces two key data types: `TFBO` and `TComputation`.

`TFBO` can be thought of as a big 2-dimensional array of vectors that can be read and written in parallel. We'll call these individual vectors "pixel-vectors". A `TFBO` can be used as the output destination for a computation or as an input argument. Under the hood, it's composed of a WebGL Framebuffer Object and its attached texture object.

`TComputation` represents a compiled program that can be run with dynamic inputs and output destinations. It holds a WebGL program made from a full-screen quad vertex shader and a partially user-defined fragment shader which specifies the output value for each "pixel-vector". It also keeps a mapping from argument names to their corresponding uniform locations so we can link the passed arguments when calling it.

Conceptually, you can think of `TFBO`s as "registers" and `TComputation`s as "instructions" of a processor. Writing a `glc` program is like designing a special-purpose processor where you have to explicitly think about what each register is designated for and define a fixed set of instructions to optimally accomplish your goal. This gives you a lot of low-level control over exactly how much memory and power your program uses.
