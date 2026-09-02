package org.mytonwallet.app_air.uiagent.viewControllers.agent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownParserTest {

    @Test
    fun `plain text keeps the existing single block path`() {
        val source = "Balance: **125 TON**\nNo table here."

        assertEquals(listOf(MarkdownParser.Block.Text(source)), MarkdownParser.parseBlocks(source))
    }

    @Test
    fun `gfm table becomes an aligned table block`() {
        val blocks = MarkdownParser.parseBlocks(
            """
                Portfolio:

                | Token | Pair | Value |
                | :--- | :---: | ---: |
                | TON | GRAM \| TON | 125.50 |

                Updated now.
            """.trimIndent()
        )

        assertEquals(3, blocks.size)
        assertEquals(MarkdownParser.Block.Text("Portfolio:"), blocks[0])
        assertEquals(
            MarkdownParser.Block.Table(
                rows = listOf(
                    listOf(
                        MarkdownParser.TableCell(
                            "Token",
                            header = true,
                            alignment = MarkdownParser.TableAlignment.START
                        ),
                        MarkdownParser.TableCell(
                            "Pair",
                            header = true,
                            alignment = MarkdownParser.TableAlignment.CENTER
                        ),
                        MarkdownParser.TableCell(
                            "Value",
                            header = true,
                            alignment = MarkdownParser.TableAlignment.END
                        )
                    ),
                    listOf(
                        MarkdownParser.TableCell("TON"),
                        MarkdownParser.TableCell(
                            "GRAM | TON",
                            alignment = MarkdownParser.TableAlignment.CENTER
                        ),
                        MarkdownParser.TableCell(
                            "125.50",
                            alignment = MarkdownParser.TableAlignment.END
                        )
                    )
                )
            ),
            blocks[1]
        )
        assertEquals(MarkdownParser.Block.Text("Updated now."), blocks[2])
    }

    @Test
    fun `missing row cells are padded and extra cells are ignored`() {
        val table = MarkdownParser.parseBlocks(
            """
                A | B
                --- | ---
                | one |
                one | two | three
            """.trimIndent()
        ).filterIsInstance<MarkdownParser.Block.Table>().single()

        assertEquals(
            listOf(listOf("one", ""), listOf("one", "two")),
            table.rows.drop(1).map { row -> row.map(MarkdownParser.TableCell::text) }
        )
    }

    @Test
    fun `html table supports telegram cell attributes`() {
        val blocks = MarkdownParser.parseBlocks(
            """
                Before
                <table border="1" class="striped compact">
                <caption><strong>Wallet</strong> &amp; positions</caption>
                <tr><th rowspan="2" valign="middle">Asset</th><th colspan="2" align="center">Position</th><th rowspan="2" valign="bottom">Status</th></tr>
                <tr><th align="right">Balance</th><th style="text-align: right">Value</th></tr>
                <tr><td><code>TON</code></td><td align="right">125.50</td><td align="right">$712.84</td><td align="center"><a href="https://tonviewer.com">Active</a></td></tr>
                <tr><td header colspan="2">Total</td><td colspan="2" align="right">**$712.84**</td></tr>
                </table>
                After
            """.trimIndent()
        )

        assertEquals(3, blocks.size)
        assertEquals(MarkdownParser.Block.Text("Before"), blocks.first())
        assertEquals(MarkdownParser.Block.Text("After"), blocks.last())
        val table = blocks.filterIsInstance<MarkdownParser.Block.Table>().single()
        assertEquals("**Wallet** & positions", table.title)
        assertTrue(table.bordered)
        assertTrue(table.striped)
        assertEquals(4, table.rows.size)
        assertEquals(
            MarkdownParser.TableCell(
                text = "Asset",
                header = true,
                verticalAlignment = MarkdownParser.TableVerticalAlignment.MIDDLE,
                rowSpan = 2
            ),
            table.rows[0][0]
        )
        assertEquals(2, table.rows[0][1].columnSpan)
        assertEquals(MarkdownParser.TableAlignment.CENTER, table.rows[0][1].alignment)
        assertEquals(
            MarkdownParser.TableVerticalAlignment.BOTTOM,
            table.rows[0][2].verticalAlignment
        )
        assertEquals("`TON`", table.rows[2][0].text)
        assertEquals("Active (https://tonviewer.com)", table.rows[2][3].text)
        assertTrue(table.rows[3][0].header)
        assertEquals("**$712.84**", table.rows[3][1].text)
    }

    @Test
    fun `html table only displays approved link targets`() {
        val table = MarkdownParser.parseBlocks(
            """
                <table>
                <tr><td><a href="javascript:alert(1)">Script</a></td><td><a href="intent://scan">Intent</a></td></tr>
                <tr><td><a href="https://tonviewer.com">Web</a></td><td><a href="mtw://wallet">Wallet</a></td></tr>
                </table>
            """.trimIndent()
        ).filterIsInstance<MarkdownParser.Block.Table>().single()

        assertEquals(
            listOf(
                listOf("Script", "Intent"),
                listOf("Web (https://tonviewer.com)", "Wallet (mtw://wallet)")
            ),
            table.rows.map { row -> row.map(MarkdownParser.TableCell::text) }
        )
    }

    @Test
    fun `table grid places cells around row and column spans`() {
        val table = MarkdownParser.parseBlocks(
            """
                <table border="1">
                <tr><th rowspan="2">Asset</th><th colspan="2">Position</th><th rowspan="2">Status</th></tr>
                <tr><th>Balance</th><th>Value</th></tr>
                <tr><td>TON</td><td>125.50</td><td>$712.84</td><td>Active</td></tr>
                </table>
            """.trimIndent()
        ).filterIsInstance<MarkdownParser.Block.Table>().single()

        val grid = MarkdownParser.resolveTableGrid(table)

        assertEquals(3, grid.rowCount)
        assertEquals(4, grid.columnCount)
        assertEquals(
            listOf(0, 1, 3, 1, 2, 0, 1, 2, 3),
            grid.cells.map(MarkdownParser.PlacedTableCell::column)
        )
    }

    @Test
    fun `html tables inside fenced code remain text`() {
        val source = """
            ```html
            <table><tr><td>Not rendered</td></tr></table>
            ```
        """.trimIndent()

        assertEquals(listOf(MarkdownParser.Block.Text(source)), MarkdownParser.parseBlocks(source))
    }

    @Test
    fun `table syntax inside fenced code remains text`() {
        val source = """
            ```markdown
            | A | B |
            | --- | --- |
            | 1 | 2 |
            ```
        """.trimIndent()

        val blocks = MarkdownParser.parseBlocks(source)

        assertEquals(listOf(MarkdownParser.Block.Text(source)), blocks)
    }

    @Test
    fun `unterminated html table falls back to plain text`() {
        val source = "<table><tr><td>Pending"

        val blocks = MarkdownParser.parseBlocks(source)

        assertEquals(listOf(MarkdownParser.Block.Text(source)), blocks)
    }

    @Test
    fun `invalid delimiter falls back to plain text`() {
        val source = """
            | A | B |
            | -- | nope |
            | 1 | 2 |
        """.trimIndent()

        val blocks = MarkdownParser.parseBlocks(source)

        assertTrue(blocks.none { it is MarkdownParser.Block.Table })
        assertEquals(listOf(MarkdownParser.Block.Text(source)), blocks)
    }
}
