`timescale 1ns/1ps

module tb_abs_8bit;
  reg  [7:0] a;
  wire [7:0] abs_a;

  integer sa;
  integer expected;
  integer i, errors;

  localparam N_CASES = 256;

  abs_8bit UUT (.a(a), .abs_a(abs_a));

  initial begin
    $dumpfile("tb_abs_8bit.vcd");
    $dumpvars(0, tb_abs_8bit);
    errors = 0;

    for (i = 0; i < N_CASES; i = i + 1) begin
      a = i;
      #10;

      sa = a; if (a[7]) sa = sa - 256;
      if (sa < 0) expected = -sa; else expected = sa;

      if ({24'b0, abs_a} !== expected) begin
        $display("Erro: a=%0d | obtido %b (%0d), esperado %0d", sa, abs_a, abs_a, expected);
        errors = errors + 1;
      end
    end

    $display("Casos de referencia (a -> |a| sem sinal):");
    for (i = 0; i < N_CASES; i = i + 1) begin
      a = i;
      #10;
      sa = a; if (a[7]) sa = sa - 256;
      if (sa == 0 || sa == 1 || sa == -1 || sa == 5 || sa == -5 || sa == 127 ||
          sa == -127 || sa == -128)
        $display("  a=%4d (%b) -> |a|=%b (%0d)", sa, a, abs_a, abs_a);
    end

    if (errors == 0) $display("PASSOU: %0d casos", N_CASES);
    else             $display("FALHOU: %0d erro(s)", errors);
    $finish;
  end
endmodule
