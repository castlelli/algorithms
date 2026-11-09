`timescale 1ns/1ps

module tb_ula_8bit;
  reg  [7:0] A, B;
  reg  [1:0] opcode;
  wire [7:0] result;
  wire       carry_out, overflow;
  wire       A_equal_B, A_not_equal_B, A_greater_B, A_greater_equal_B, A_less_B, A_less_equal_B;
  wire       even_parity, odd_parity;

  wire [5:0] cmp_flags = {A_equal_B, A_not_equal_B, A_greater_B,
                          A_greater_equal_B, A_less_B, A_less_equal_B};
  wire [1:0] parity_flags = {even_parity, odd_parity};

  localparam ADD = 2'b00, SUB = 2'b01, MUL2 = 2'b10, DIV2 = 2'b11;
  localparam EQ = 6'b100101, GT = 6'b011100, LT = 6'b010011;
  localparam EVEN = 2'b10, ODD = 2'b01;
  localparam N_CASES = 262144;

  integer sa, sb, ma, mb, r, rr, rs, ones, k;
  integer i, errors, directed_errors;
  reg  [7:0] exp_result;
  reg        exp_cout, exp_ovf;
  reg  [5:0] exp_cmp;
  reg  [1:0] exp_parity;
  reg        result_ok;

  ula_8bit UUT (
    .A(A), .B(B), .opcode(opcode),
    .result(result), .carry_out(carry_out), .overflow(overflow),
    .A_equal_B(A_equal_B), .A_not_equal_B(A_not_equal_B),
    .A_greater_B(A_greater_B), .A_greater_equal_B(A_greater_equal_B),
    .A_less_B(A_less_B), .A_less_equal_B(A_less_equal_B),
    .even_parity(even_parity), .odd_parity(odd_parity)
  );

  task check;
    input [7:0] a_in, b_in;
    input [1:0] op_in;
    input [7:0] result_in;
    input       cout_in, ovf_in;
    input [5:0] cmp_in;
    input [1:0] parity_in;
    begin
      A = a_in; B = b_in; opcode = op_in;
      #10;
      if (result !== result_in || carry_out !== cout_in || overflow !== ovf_in ||
          cmp_flags !== cmp_in || parity_flags !== parity_in) begin
        $display("Erro: A=%b B=%b op=%b | obtido result=%b c=%b v=%b cmp=%b par=%b",
                 A, B, opcode, result, carry_out, overflow, cmp_flags, parity_flags);
        $display("                         | esperado result=%b c=%b v=%b cmp=%b par=%b",
                 result_in, cout_in, ovf_in, cmp_in, parity_in);
        directed_errors = directed_errors + 1;
      end else
        $display("ok:   A=%b B=%b op=%b | result=%b c=%b v=%b cmp=%b par=%b",
                 A, B, opcode, result, carry_out, overflow, cmp_flags, parity_flags);
    end
  endtask

  initial begin
    $dumpfile("tb_ula_8bit.vcd");
    $dumpvars(0, tb_ula_8bit);
    directed_errors = 0;
    errors = 0;

    $display("Parte 1: vetores fixos (cmp = eq ne gt ge lt le, par = even odd)");

    check(8'b0000_0001, 8'b0000_0001, ADD,  8'b0000_0010, 0, 0, EQ, ODD);
    check(8'b0111_1111, 8'b0000_0001, ADD,  8'b1000_0000, 0, 1, GT, ODD);
    check(8'b1111_1111, 8'b0000_0001, ADD,  8'b0000_0000, 1, 0, EQ, EVEN);
    check(8'b1000_0000, 8'b1111_1111, ADD,  8'b0111_1111, 1, 1, GT, ODD);
    check(8'b1000_0000, 8'b1000_0000, ADD,  8'b0000_0000, 1, 1, EQ, ODD);
    check(8'b0110_0100, 8'b0011_0010, ADD,  8'b1001_0110, 0, 1, GT, ODD);

    check(8'b0000_0101, 8'b0000_0011, SUB,  8'b0000_0010, 1, 0, GT, EVEN);
    check(8'b0000_0011, 8'b0000_0101, SUB,  8'b1111_1110, 0, 0, LT, EVEN);
    check(8'b0000_0000, 8'b1000_0000, SUB,  8'b1000_0000, 0, 1, LT, EVEN);
    check(8'b1000_0000, 8'b0000_0001, SUB,  8'b0111_1111, 1, 1, GT, ODD);
    check(8'b1000_0000, 8'b1000_0000, SUB,  8'b0000_0000, 1, 0, EQ, ODD);
    check(8'b1111_1011, 8'b0000_0101, SUB,  8'b1111_0110, 1, 0, EQ, ODD);

    check(8'b0000_0011, 8'b0000_0000, MUL2, 8'b0000_0110, 0, 0, GT, EVEN);
    check(8'b1111_1101, 8'b0000_0011, MUL2, 8'b1111_1010, 0, 0, EQ, ODD);
    check(8'b0100_0000, 8'b1100_0000, MUL2, 8'b1000_0000, 0, 0, EQ, ODD);
    check(8'b1000_0000, 8'b0111_1111, MUL2, 8'b0000_0000, 0, 0, GT, ODD);
    check(8'b1111_1111, 8'b1111_1000, MUL2, 8'b1111_1110, 0, 0, LT, EVEN);
    check(8'b1000_0000, 8'b1000_0000, MUL2, 8'b0000_0000, 0, 0, EQ, ODD);

    check(8'b0000_0110, 8'b0000_0111, DIV2, 8'b0000_0011, 0, 0, LT, EVEN);
    check(8'b0000_0111, 8'b0000_0110, DIV2, 8'b0000_0011, 0, 0, GT, ODD);
    check(8'b1111_1111, 8'b0000_0000, DIV2, 8'b1111_1111, 0, 0, GT, EVEN);
    check(8'b1111_1101, 8'b0000_0010, DIV2, 8'b1111_1110, 0, 0, GT, ODD);
    check(8'b1000_0000, 8'b1000_0001, DIV2, 8'b1100_0000, 0, 0, GT, ODD);
    check(8'b0111_1111, 8'b1000_0000, DIV2, 8'b0011_1111, 0, 0, LT, ODD);
    check(8'b0111_1111, 8'b0000_0001, DIV2, 8'b0011_1111, 0, 0, GT, ODD);
    check(8'b0000_0000, 8'b0000_0000, DIV2, 8'b0000_0000, 0, 0, EQ, EVEN);

    if (directed_errors == 0) $display("Parte 1: PASSOU (26 vetores)");
    else                      $display("Parte 1: FALHOU com %0d erro(s)", directed_errors);

    $display("Parte 2: teste exaustivo contra modelo de referencia (%0d casos)", N_CASES);

    for (i = 0; i < N_CASES; i = i + 1) begin
      {A, B, opcode} = i;
      #10;

      sa = A; if (A[7]) sa = sa - 256;
      sb = B; if (B[7]) sb = sb - 256;

      exp_cout = 0;
      exp_ovf = 0;
      if (opcode == ADD) begin
        rr = A + B;
        exp_result = rr[7:0];
        exp_cout = rr[8];
        r = sa + sb;
        exp_ovf = (r > 127) || (r < -128);
      end else if (opcode == SUB) begin
        rr = A + (255 - B) + 1;
        exp_result = rr[7:0];
        exp_cout = rr[8];
        r = sa - sb;
        exp_ovf = (r > 127) || (r < -128);
      end else if (opcode == MUL2) begin
        rr = A + A;
        exp_result = rr[7:0];
      end

      if (opcode == DIV2) begin
        rs = result; if (result[7]) rs = rs - 256;
        result_ok = ((rs + rs + A[0]) === sa);
      end else
        result_ok = (result === exp_result);

      if (sa < 0) ma = -sa; else ma = sa;
      if (sb < 0) mb = -sb; else mb = sb;
      exp_cmp = {ma == mb, ma != mb, ma > mb, ma >= mb, ma < mb, ma <= mb};

      ones = 0;
      for (k = 0; k < 8; k = k + 1)
        ones = ones + A[k];
      exp_parity = {~ones[0], ones[0]};

      if (!result_ok || carry_out !== exp_cout || overflow !== exp_ovf ||
          cmp_flags !== exp_cmp || parity_flags !== exp_parity) begin
        if (errors < 10)
          $display("Erro: A=%0d B=%0d op=%b | result=%b c=%b v=%b cmp=%b par=%b | esperado c=%b v=%b cmp=%b par=%b",
                   sa, sb, opcode, result, carry_out, overflow, cmp_flags, parity_flags,
                   exp_cout, exp_ovf, exp_cmp, exp_parity);
        errors = errors + 1;
      end
    end

    if (errors == 0) $display("Parte 2: PASSOU (%0d casos)", N_CASES);
    else             $display("Parte 2: FALHOU com %0d erro(s)", errors);

    if (directed_errors == 0 && errors == 0) $display("RESULTADO FINAL: PASSOU");
    else                                     $display("RESULTADO FINAL: FALHOU");
    $finish;
  end
endmodule
