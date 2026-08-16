package app.studentamkeen.tamkeen;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ScaleGestureDetector;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.HorizontalScrollView;
import android.widget.ScrollView;

import androidx.appcompat.app.AppCompatActivity;

import java.io.File;

/**
 * 18C2 — native PDF page renderer.
 *
 * Uses android.graphics.pdf.PdfRenderer (PDFium) with RENDER_MODE_FOR_DISPLAY,
 * which renders the embedded Arabic subset fonts of the ministry books
 * correctly (pdf.js does not). Only the current page is rasterised; the
 * previous bitmap is recycled before the next one is created.
 */
public class PdfViewerActivity extends AppCompatActivity {

    public static final String EXTRA_ABSOLUTE_PATH = "absolutePath";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_INITIAL_PAGE = "initialPage";
    public static final String EXTRA_LAST_PAGE = "lastPage";

    private static final float MIN_SCALE = 1.0f;
    private static final float MAX_SCALE = 3.0f;

    private ParcelFileDescriptor descriptor;
    private PdfRenderer renderer;
    private Bitmap currentBitmap;

    private ImageView pageView;
    private TextView pageLabel;
    private Button prevButton;
    private Button nextButton;

    private int pageIndex = 0;
    private float scale = 1.0f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildLayout());

        String path = getIntent().getStringExtra(EXTRA_ABSOLUTE_PATH);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        int initialPage = Math.max(1, getIntent().getIntExtra(EXTRA_INITIAL_PAGE, 1));

        if (title != null && !title.trim().isEmpty()) {
            setTitle(title);
        }

        try {
            File file = new File(path);
            descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
            renderer = new PdfRenderer(descriptor);
        } catch (Exception e) {
            Toast.makeText(this, "تعذّر فتح الملف", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        pageIndex = Math.min(initialPage, renderer.getPageCount()) - 1;
        showPage(pageIndex);
    }

    private View buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#111827"));
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);

        pageLabel = new TextView(this);
        pageLabel.setTextColor(Color.WHITE);
        pageLabel.setPadding(24, 24, 24, 16);
        pageLabel.setGravity(Gravity.CENTER);
        root.addView(pageLabel, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        pageView = new ImageView(this);
        pageView.setAdjustViewBounds(true);
        pageView.setScaleType(ImageView.ScaleType.FIT_CENTER);

        HorizontalScrollView hScroll = new HorizontalScrollView(this);
        hScroll.addView(pageView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        ScrollView vScroll = new ScrollView(this);
        vScroll.addView(hScroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(vScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        final ScaleGestureDetector pinch = new ScaleGestureDetector(this,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override
                    public boolean onScale(ScaleGestureDetector detector) {
                        float next = scale * detector.getScaleFactor();
                        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
                        showPage(pageIndex);
                        return true;
                    }
                });
        vScroll.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent event) {
                pinch.onTouchEvent(event);
                return false;
            }
        });

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(16, 16, 16, 24);

        prevButton = new Button(this);
        prevButton.setText("السابق");
        prevButton.setOnClickListener(v -> showPage(pageIndex - 1));

        nextButton = new Button(this);
        nextButton.setText("التالي");
        nextButton.setOnClickListener(v -> showPage(pageIndex + 1));

        Button closeButton = new Button(this);
        closeButton.setText("رجوع للدرس");
        closeButton.setOnClickListener(v -> finishWithResult());

        LinearLayout.LayoutParams lp =
                new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        bar.addView(prevButton, lp);
        bar.addView(nextButton, new LinearLayout.LayoutParams(lp));
        bar.addView(closeButton, new LinearLayout.LayoutParams(lp));
        root.addView(bar, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        return root;
    }

    /** Renders exactly one page; the previous bitmap is recycled first. */
    private void showPage(int index) {
        if (renderer == null) return;
        if (index < 0 || index >= renderer.getPageCount()) return;
        pageIndex = index;

        PdfRenderer.Page page = renderer.openPage(index);
        int width = (int) (page.getWidth() * 2 * scale);
        int height = (int) (page.getHeight() * 2 * scale);

        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        bitmap.eraseColor(Color.WHITE);
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
        page.close();

        pageView.setImageBitmap(bitmap);
        if (currentBitmap != null && !currentBitmap.isRecycled()) {
            currentBitmap.recycle();
        }
        currentBitmap = bitmap;

        pageLabel.setText("صفحة " + (pageIndex + 1) + " من " + renderer.getPageCount());
        prevButton.setEnabled(pageIndex > 0);
        nextButton.setEnabled(pageIndex < renderer.getPageCount() - 1);
    }

    private void finishWithResult() {
        Intent data = new Intent();
        data.putExtra(EXTRA_LAST_PAGE, pageIndex + 1);
        setResult(Activity.RESULT_OK, data);
        finish();
    }

    @Override
    public void onBackPressed() {
        finishWithResult();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (currentBitmap != null && !currentBitmap.isRecycled()) currentBitmap.recycle();
        currentBitmap = null;
        try {
            if (renderer != null) renderer.close();
            if (descriptor != null) descriptor.close();
        } catch (Exception ignored) {
            // closing twice is harmless
        }
    }
}
