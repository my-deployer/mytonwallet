package org.mytonwallet.app_air.uibrowser.viewControllers.search

import androidx.core.net.toUri
import androidx.core.view.isGone
import androidx.recyclerview.widget.RecyclerView
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.CLEAR_ALL_BUTTON_TAG
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.GAP_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.RECENT_SEARCH_TITLE_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.SEARCH_DAPP_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.SEARCH_HISTORY_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.SEARCH_MATCH_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.SEARCH_SEARCHED_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.SEARCH_TITLE_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.SearchVC.Companion.SEARCH_WALLET_CELL
import org.mytonwallet.app_air.uibrowser.viewControllers.search.cells.SearchDappCell
import org.mytonwallet.app_air.uibrowser.viewControllers.search.cells.SearchHistoryCell
import org.mytonwallet.app_air.uibrowser.viewControllers.search.cells.SearchItemCell
import org.mytonwallet.app_air.uibrowser.viewControllers.search.cells.SearchMatchedCell
import org.mytonwallet.app_air.uibrowser.viewControllers.search.cells.SearchWalletCell
import org.mytonwallet.app_air.uicomponents.commonViews.cells.HeaderCell
import org.mytonwallet.app_air.uicomponents.widgets.WButton
import org.mytonwallet.app_air.uicomponents.widgets.WCell
import org.mytonwallet.app_air.uiinappbrowser.InAppBrowserVC
import org.mytonwallet.app_air.walletbasecontext.localization.LocaleController
import org.mytonwallet.app_air.walletbasecontext.theme.WColor
import org.mytonwallet.app_air.walletcontext.utils.IndexPath
import org.mytonwallet.app_air.walletcore.deeplink.DeeplinkParser
import org.mytonwallet.app_air.walletcore.models.InAppBrowserConfig

internal class LegacySearchDataSource(searchVC: SearchVC) : SearchDataSource(searchVC) {
    private companion object {
        const val SECTION_MY_WALLETS = 0
        const val SECTION_WALLET = 1
        const val SECTION_MATCH = 2
        const val SECTION_RECENT_QUERIES = 3
        const val SECTION_SUGGESTIONS = 4
        const val SECTION_DAPPS = 5
        const val SECTION_HISTORY = 6
    }

    override fun recyclerViewNumberOfSections(rv: RecyclerView): Int = 7

    override fun recyclerViewNumberOfItems(rv: RecyclerView, section: Int): Int = when (section) {
        SECTION_MY_WALLETS -> {
            if (searchResult?.myWallets.isNullOrEmpty()) {
                0
            } else {
                2 +
                    searchResult!!.myWallets!!.size
            }
        }

        SECTION_WALLET -> {
            if (searchResult?.walletInfo == null) 0 else 2
        }

        SECTION_MATCH -> {
            if (searchResult?.matchedVisitedSite == null) 0 else 2
        }

        SECTION_RECENT_QUERIES -> {
            if ((
                    searchResult?.keyword.isNullOrEmpty() &&
                        !searchResult?.recentSearches.isNullOrEmpty()
                    ) ||
                (!searchResult?.keyword.isNullOrEmpty() && searchResult?.noResultsFound == true)
            ) {
                2 + searchResult?.recentSearches!!.size
            } else {
                0
            }
        }

        SECTION_SUGGESTIONS -> {
            if (searchResult?.matchedVisitedSite == null &&
                !searchResult?.keyword.isNullOrEmpty() &&
                !searchResult?.recentSearches.isNullOrEmpty() &&
                searchResult?.noResultsFound != true
            ) {
                2 + searchResult?.recentSearches!!.size
            } else {
                0
            }
        }

        SECTION_DAPPS -> {
            if (!searchResult?.keyword.isNullOrEmpty() &&
                !searchResult?.dapps.isNullOrEmpty()
            ) {
                2 + searchResult?.dapps!!.size
            } else {
                0
            }
        }

        SECTION_HISTORY -> {
            if (!searchResult?.keyword.isNullOrEmpty() &&
                !searchResult?.recentVisitedSites.isNullOrEmpty()
            ) {
                2 +
                    searchResult?.recentVisitedSites!!.size
            } else {
                0
            }
        }

        else -> {
            throw Exception()
        }
    }

    override fun recyclerViewCellType(rv: RecyclerView, indexPath: IndexPath): WCell.Type {
        if (indexPath.row == 0) {
            return when (indexPath.section) {
                SECTION_WALLET -> {
                    SEARCH_WALLET_CELL
                }

                SECTION_MATCH -> {
                    SEARCH_MATCH_CELL
                }

                SECTION_RECENT_QUERIES -> {
                    RECENT_SEARCH_TITLE_CELL
                }

                else -> {
                    SEARCH_TITLE_CELL
                }
            }
        }
        if (indexPath.row == recyclerViewNumberOfItems(rv, indexPath.section) - 1) {
            return GAP_CELL
        }

        return when (indexPath.section) {
            SECTION_MY_WALLETS -> {
                SEARCH_WALLET_CELL
            }

            SECTION_RECENT_QUERIES -> {
                SEARCH_SEARCHED_CELL
            }

            SECTION_SUGGESTIONS -> {
                SEARCH_HISTORY_CELL
            }

            SECTION_DAPPS -> {
                SEARCH_DAPP_CELL
            }

            SECTION_HISTORY -> {
                SEARCH_HISTORY_CELL
            }

            else -> {
                throw Error()
            }
        }
    }

    override fun recyclerViewConfigureCell(
        rv: RecyclerView,
        cellHolder: WCell.Holder,
        indexPath: IndexPath
    ) {
        if (configureGapCell(rv, cellHolder, indexPath)) return

        when (indexPath.section) {
            SECTION_MY_WALLETS -> {
                if (indexPath.row == 0) {
                    (cellHolder.cell as HeaderCell).configure(
                        LocaleController.getString("My"),
                        titleColor = WColor.Tint,
                        topRounding = topRounding(indexPath)
                    )
                } else {
                    (cellHolder.cell as SearchWalletCell).configure(
                        searchResult?.myWallets!![indexPath.row - 1],
                        indexPath.row == searchResult?.myWallets!!.size
                    )
                }
            }

            SECTION_WALLET -> {
                (cellHolder.cell as SearchWalletCell).configure(
                    searchResult?.walletInfo!!,
                    isLastItem = true
                )
            }

            SECTION_MATCH -> {
                (cellHolder.cell as SearchMatchedCell).configure(searchResult?.matchedVisitedSite!!)
            }

            SECTION_RECENT_QUERIES -> {
                if (indexPath.row == 0) {
                    val isValidDeeplink = searchResult?.keyword?.takeIf { it.isNotBlank() }
                        ?.let { DeeplinkParser.parse(it.toUri()) } != null
                    (cellHolder.cell as HeaderCell).apply {
                        findViewWithTag<WButton>(CLEAR_ALL_BUTTON_TAG).isGone =
                            searchResult?.noResultsFound == true
                    }.configure(
                        LocaleController.getString(
                            if (searchResult?.noResultsFound == true) {
                                (if (isValidDeeplink) "Open in App" else "Search in Google")
                            } else {
                                "Recent Searches"
                            }
                        ),
                        titleColor = WColor.Tint,
                        topRounding = topRounding(indexPath)
                    )
                } else {
                    (cellHolder.cell as SearchItemCell).configure(
                        searchResult?.recentSearches!![indexPath.row - 1].title,
                        indexPath.row == searchResult?.recentSearches!!.size
                    )
                }
            }

            SECTION_SUGGESTIONS -> {
                if (indexPath.row == 0) {
                    (cellHolder.cell as HeaderCell).configure(
                        LocaleController.getString("Suggestions"),
                        titleColor = WColor.Tint,
                        topRounding = topRounding(indexPath)
                    )
                } else {
                    val search = searchResult?.recentSearches!![indexPath.row - 1]
                    (cellHolder.cell as SearchHistoryCell).configure(
                        search,
                        indexPath.row == searchResult?.recentSearches!!.size,
                        onTap = {
                            val (isValidUrl, uri) = InAppBrowserVC.convertToUri(search.title)
                            openInAppBrowser(
                                InAppBrowserConfig(
                                    url = uri.toString(),
                                    injectDappConnect = true,
                                    saveInVisitedHistory = isValidUrl
                                )
                            )
                        }
                    )
                }
            }

            SECTION_DAPPS -> {
                if (indexPath.row == 0) {
                    (cellHolder.cell as HeaderCell).configure(
                        LocaleController.getString("Popular and connected apps"),
                        titleColor = WColor.Tint,
                        topRounding = topRounding(indexPath)
                    )
                } else {
                    (cellHolder.cell as SearchDappCell).configure(
                        searchResult?.dapps!![indexPath.row - 1],
                        indexPath.row == searchResult?.dapps!!.size
                    )
                }
            }

            SECTION_HISTORY -> {
                if (indexPath.row == 0) {
                    (cellHolder.cell as HeaderCell).configure(
                        LocaleController.getString("History"),
                        titleColor = WColor.Tint,
                        topRounding = topRounding(indexPath)
                    )
                } else {
                    val site = searchResult?.recentVisitedSites!![indexPath.row - 1]
                    (cellHolder.cell as SearchHistoryCell).configure(
                        site,
                        indexPath.row == searchResult?.recentVisitedSites!!.size,
                        onTap = {
                            openInAppBrowser(
                                InAppBrowserConfig(
                                    url = site.url,
                                    injectDappConnect = true,
                                    saveInVisitedHistory = true
                                )
                            )
                        }
                    )
                }
            }
        }
    }
}
