`timescale 1ns/1ps

module tb_parity_8bit;
  reg  [7:0] a;
  wire       even, odd;

  integer ones, k, sa;
  integer i, errors;

  localparam N_CASES = 256;

  parity_8bit UUT (.a(a), .even(even), .odd(odd));

  initial begin
    $dumpfile("tb_parity_8bit.vcd");
    $dumpvars(0, tb_parity_8bit);
    errors = 0;

    for (i = 0; i < N_CASES; i = i + 1) begin
      a = i;
      #10;

      ones = 0;
      for (k = 0; k < 8; k = k + 1)
        ones = ones + a[k];

      if (odd !== ones[0] || even !== ~ones[0]) begin
        $display("Erro: a=%b (%0d bits 1) | obtido even=%b odd=%b, esperado even=%b odd=%b",
                 a, ones, even, odd, ~ones[0], ones[0]);
        errors = errors + 1;
      end
    end

    $display("Casos de referencia (a -> even, odd):");
    for (i = 0; i < N_CASES; i = i + 1) begin
      a = i;
      #10;
      sa = a; if (a[7]) sa = sa - 256;
      if (sa == 0 || sa == 1 || sa == 2 || sa == 3 || sa == -1 || sa == -128)
        $display("  a=%4d (%b) -> even=%b odd=%b", sa, a, even, odd);
    end

    if (errors == 0) $display("PASSOU: %0d casos", N_CASES);
    else             $display("FALHOU: %0d erro(s)", errors);
    $finish;
  end
endmodule
