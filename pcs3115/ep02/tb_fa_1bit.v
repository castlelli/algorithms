`timescale 1ns/1ps

module tb_fa_1bit;
  reg  a, b, cin;
  wire s, cout;
  reg  [1:0] expected;
  integer i, errors;

  fa UUT (.a(a), .b(b), .cin(cin), .s(s), .cout(cout));

  initial begin
    $dumpfile("tb_fa_1bit.vcd");
    $dumpvars(0, tb_fa_1bit);
    errors = 0;

    for (i = 0; i < 8; i = i + 1) begin
      {a, b, cin} = i;
      #10;
      expected = a + b + cin;
      if ({cout, s} !== expected) begin
        $display("Erro: a=%b b=%b cin=%b | obtido %b%b, esperado %b", a, b, cin, cout, s, expected);
        errors = errors + 1;
      end else
        $display("ok:   a=%b b=%b cin=%b | cout=%b s=%b", a, b, cin, cout, s);
    end

    if (errors == 0) $display("PASSOU");
    else            $display("FALHOU: %0d erro(s)", errors);
    $finish;
  end
endmodule
