#include <stdio.h>
#include <stdlib.h>
// Exercise 2.2: Test how long your compiler takes for this program for N = something
/*Mine:
10 (10³): 0.006s
100 (100³): 0.013s (almost 2x)
1000 (1000³): 2.077s
2000 (2000³): 16s
4000 (4000³ = 64billion): 2m12s = 132s


*/
int main(int argc, char *argv[])
{
    int N = atoi(argv[1]);
    int i, j, k;
    int count = 0;
    for (i = 0; i < N; i++)
    {
        for (j = 0; j < N; j++)
        {
            for (k = 0; k < N; k++)
            {
                count++;
            }
        }
    }
}