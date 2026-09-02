@file:Suppress("ktlint:standard:filename")

package org.mytonwallet.app_air.uicomponents.commonViews

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.view.View
import org.mytonwallet.app_air.uicomponents.extensions.dp
import org.mytonwallet.app_air.uicomponents.widgets.WThemedView
import org.mytonwallet.app_air.walletbasecontext.theme.ThemeManager
import org.mytonwallet.app_air.walletbasecontext.theme.ViewConstants
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletbasecontext.theme.color
import org.mytonwallet.app_air.walletbasecontext.utils.Vec2i
import org.mytonwallet.app_air.walletbasecontext.utils.vec2i
import org.mytonwallet.app_air.walletbasecontext.utils.x
import org.mytonwallet.app_air.walletbasecontext.utils.y

@SuppressLint("ViewConstructor")
class SkeletonView(
    context: Context,
    val isVertical: Boolean = true,
    val forcedLight: Boolean = false
) : View(context),
    WThemedView {

    private var gradientPaint: Paint = Paint()
    private var gradientColors: IntArray = intArrayOf()
    private var animator: ValueAnimator? = null
    private var gradientShader: LinearGradient? = null
    private val shaderMatrix = Matrix()
    private val gradientPositions = floatArrayOf(0.0f, 0.1f, 0.2f)

    var isAnimating: Boolean = false

    private val myLocation: Vec2i = vec2i()
    private val location: Vec2i = vec2i()
    private val maskPath = Path()
    private val maskRadii = FloatArray(8)

    init {
        id = generateViewId()
        isFocusable = false
        visibility = INVISIBLE
        updateTheme()
    }

    private val topCornerRadius = ViewConstants.BLOCK_RADIUS.dp
    private var maskViews = emptyList<View>()
    private var maskCornerRadius: HashMap<Int, Float>? = null
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        // To properly calculate coordinates when SkeletonView is not rooted to 0,0 of the screen
        getLocationOnScreen(myLocation)

        canvas.save()
        for ((index, view) in maskViews.withIndex()) {
            if (!view.isShown) continue

            view.getLocationOnScreen(location)

            if (location.x == 0 && location.y == 0) continue

            val left = location.x.toFloat() - myLocation.x
            val top = location.y.toFloat() - myLocation.y

            val right = left + view.width
            val bottom = top + view.height

            val itemRadius = maskCornerRadius?.get(index)
            if (index == 0 || itemRadius != null) {
                if (itemRadius != null) {
                    canvas.drawRoundRect(
                        left,
                        top,
                        right,
                        bottom,
                        itemRadius,
                        itemRadius,
                        gradientPaint
                    )
                } else {
                    for (i in 0..3) maskRadii[i] = topCornerRadius
                    for (i in 4..7) maskRadii[i] = 0f
                    maskPath.rewind()
                    maskPath.addRoundRect(
                        left,
                        top,
                        right,
                        bottom,
                        maskRadii,
                        Path.Direction.CW
                    )
                    canvas.drawPath(maskPath, gradientPaint)
                }
            } else {
                canvas.drawRect(left, top, right, bottom, gradientPaint)
            }
        }
        canvas.restore()
    }

    fun startAnimating() {
        if (isAnimating) return

        visibility = VISIBLE
        isAnimating = true
        startAnimator()
    }

    private fun startAnimator() {
        gradientShader = if (isVertical) {
            LinearGradient(
                0f,
                0f,
                0f,
                height.toFloat(),
                gradientColors,
                gradientPositions,
                Shader.TileMode.CLAMP
            )
        } else {
            LinearGradient(
                0f,
                0f,
                width.toFloat(),
                height.toFloat(),
                gradientColors,
                gradientPositions,
                Shader.TileMode.CLAMP
            )
        }
        gradientPaint.shader = gradientShader

        val animValue = if (isVertical) height else width.coerceAtLeast(height)
        animator =
            ValueAnimator.ofFloat(0.2f * -animValue, 1.2f * animValue).apply {
                duration = 2000L
                repeatCount = ValueAnimator.INFINITE
                addUpdateListener { animation ->
                    val animatedValue = animation.animatedValue as Float
                    if (isVertical) {
                        shaderMatrix.setTranslate(0f, animatedValue)
                    } else {
                        shaderMatrix.setTranslate(animatedValue, animatedValue)
                    }
                    gradientShader?.setLocalMatrix(shaderMatrix)
                    invalidate()
                }
                start()
            }
    }

    fun stopAnimating() {
        if (!isAnimating) return

        isAnimating = false
        visibility = GONE
        cancelAnimator()
    }

    private fun cancelAnimator() {
        animator?.cancel()
        animator = null
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (isAnimating && animator == null) startAnimator()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (animator != null) {
            cancelAnimator()
            startAnimator()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cancelAnimator()
    }

    fun applyMask(views: List<View>, radius: HashMap<Int, Float>? = null) {
        maskViews = views
        maskCornerRadius = radius
    }

    override fun updateTheme() {
        gradientColors = if (!forcedLight && ThemeManager.isDark) {
            intArrayOf(0x00000000, WColor.Background.color, 0x00000000)
        } else {
            intArrayOf(0x00FFFFFF, 0x44FFFFFF, 0x00FFFFFF)
        }
        if (animator != null) {
            cancelAnimator()
            startAnimator()
        }
    }

    fun onDestroy() {
        stopAnimating()
        maskViews = emptyList()
        maskCornerRadius = HashMap()
    }
}
