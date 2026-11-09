`timescale 1ns/1ps

module tb_shifter_8bit;
  reg  [7:0] a;
  wire [7:0] mul2, div2;

  reg  [7:0] expected_mul;
  integer    sa, sdiv;
  integer    i, errors;

  localparam N_CASES = 256;

  shifter_8bit UUT (.a(a), .mul2(mul2), .div2(div2));

  initial begin
    $dumpfile("tb_shifter_8bit.vcd");
    $dumpvars(0, tb_shifter_8bit);
    errors = 0;

    for (i = 0; i < N_CASES; i = i + 1) begin
      a = i;
      #10;

      sa   = a;    if (a[7])    sa   = sa   - 256;
      sdiv = div2; if (div2[7]) sdiv = sdiv - 256;

      expected_mul = a + a;
      if (mul2 !== expected_mul) begin
        $display("Erro em mul2: a=%0d | obtido %b, esperado %b", sa, mul2, expected_mul);
        errors = errors + 1;
      end

      if ((sdiv + sdiv + a[0]) !== sa) begin
        $display("Erro em div2: a=%0d | obtido %b (%0d), esperado q com 2q + %b = %0d",
                 sa, div2, sdiv, a[0], sa);
        errors = errors + 1;
      end
    end

    $display("Casos de referencia (a -> mul2, div2):");
    for (i = 0; i < N_CASES; i = i + 1) begin
      a = i;
      #10;
      sa = a; if (a[7]) sa = sa - 256;
      if (sa == 6 || sa == 7 || sa == 3 || sa == -3 || sa == -1 || sa == 64 ||
          sa == 127 || sa == -128)
        $display("  a=%4d (%b) -> mul2=%b  div2=%b", sa, a, mul2, div2);
    end

    if (errors == 0) $display("PASSOU: %0d casos", N_CASES);
    else             $display("FALHOU: %0d erro(s)", errors);
    $finish;
  end
endmodule
