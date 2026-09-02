package org.mytonwallet.app_air.uiagent.viewControllers.agent.views

import org.junit.Assert.assertEquals
import org.junit.Test
import org.mytonwallet.app_air.uiagent.viewControllers.agent.MarkdownParser

class AgentTableRenderingTest {

    @Test
    fun `large table is truncated after two hundred rows`() {
        val table = MarkdownParser.Block.Table(
            rows = List(205) { rowIndex ->
                List(5) { columnIndex ->
                    MarkdownParser.TableCell(
                        text = "$rowIndex:$columnIndex",
                        rowSpan = if (rowIndex == 199 && columnIndex == 0) 10 else 1
                    )
                }
            }
        )

        val limited = limitTableForRendering(table)

        assertEquals(201, limited.rows.size)
        assertEquals("199:4", limited.rows[199][4].text)
        assertEquals(1, limited.rows[199][0].rowSpan)
        assertEquals("…", limited.rows.last().single().text)
        assertEquals(5, limited.rows.last().single().columnSpan)
    }

    @Test
    fun `wide table is truncated after one thousand cells`() {
        val table = MarkdownParser.Block.Table(
            rows = listOf(
                List(1_250) { columnIndex -> MarkdownParser.TableCell("Cell $columnIndex") }
            )
        )

        val limited = limitTableForRendering(table)

        assertEquals(1_000, limited.rows.first().size)
        assertEquals("Cell 999", limited.rows.first().last().text)
        assertEquals("…", limited.rows.last().single().text)
        assertEquals(1_000, limited.rows.last().single().columnSpan)
    }
}
