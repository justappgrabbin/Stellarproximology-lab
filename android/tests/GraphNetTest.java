import org.stellar.livinglab.GraphNet;

public class GraphNetTest {
    public static void main(String[] args) {
        GraphNet net=new GraphNet();double[] a=GraphNet.features("movement social direction"),b=GraphNet.unitFeatures("010101",0);
        double before=net.score(a,b),loss=0;
        for(int i=0;i<250;i++)loss=net.train(a,b,1);
        double after=net.score(a,b);
        if(!(after>before)||!Double.isFinite(loss))throw new AssertionError("Relationship learning did not improve");
        for(int d=0;d<4;d++)for(int i=0;i<64;i++){
            String bits=String.format("%6s",Integer.toBinaryString(i)).replace(' ','0');
            double score=net.score(a,GraphNet.unitFeatures(bits,d));
            if(!Double.isFinite(score)||score<0||score>1)throw new AssertionError("Invalid unit score");
        }
        System.out.println("PASS: learned relationship score "+before+" -> "+after+"; all 256 unit scores finite");
    }
}
