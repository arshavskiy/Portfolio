<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Menu from 'primevue/menu'
import Tag from 'primevue/tag'
import Toolbar from 'primevue/toolbar'
import api from '@/composables/useApi'
import AddTransactionModal from '@/components/ui/AddTransactionModal.vue'
import AppLoader from '@/components/ui/AppLoader.vue'
import ImportModal from '@/components/ui/ImportModal.vue'
import IncomeProjectionChart from '@/components/charts/IncomeProjectionChart.vue'
import { useIncomeProjection } from '@/composables/useIncomeProjection'
import { useDesktopFocusStore } from '@/stores/desktopFocus'
import { useDashboardStore } from '@/stores/dashboard'
import { useAuthStore } from '@/stores/auth'
import { usePortfolioStore } from '@/stores/portfolio'
import { gainLossClass, usePercent } from '@/composables/useFormat'
import { useI18n } from '@/composables/useI18n'
import { useNavigateToPosition } from '@/composables/useNavigateToPosition'

const portfolio = usePortfolioStore()
const dashboard = useDashboardStore()
const auth = useAuthStore()
const desktopFocus = useDesktopFocusStore()
const { positions, loading } = storeToRefs(portfolio)
const { t } = useI18n()
const { openPosition } = useNavigateToPosition()
const {
  months: incomeMonths,
  totals: incomeTotals,
  loading: incomeLoading,
  fetchProjection,
} = useIncomeProjection()

const searchQuery = ref('')
const selectedAssets = ref([])
const showTxModal = ref(false)
const showUpdateModal = ref(false)
const showImportModal = ref(false)
const newAssetMenu = ref(null)
const pageMenu = ref(null)
const rowMenu = ref(null)
const activeAsset = ref(null)
const txModalType = ref('buy')

const groupOrder = ['Equity', 'Crypto', 'Cash', 'Bond', 'Other']

function classifyAsset(position) {
  const ticker = String(position.ticker || '').toUpperCase()
  const sector = String(position.sector || '').toLowerCase()
  const industry = String(position.industry || '').toLowerCase()

  if (ticker.endsWith('-USD')) return 'Crypto'
  if (/^(CASH|USD|EUR|ILS|USDT|USDC)$/.test(ticker)) return 'Cash'
  if (sector.includes('bond') || industry.includes('bond') || industry.includes('treasury')) return 'Bond'
  if (sector.includes('cash') || industry.includes('cash')) return 'Cash'
  return 'Equity'
}

function formatNumber(value, digits = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n)
}

function formatPrice(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatSignedNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${formatPrice(Math.abs(n))}`
}

function cryptoBaseTicker(ticker) {
  const value = String(ticker || '').trim()
  return value.replace(/-USD$/i, '')
}

function displayAssetTicker(asset) {
  if (asset.assetClass === 'Crypto') return cryptoBaseTicker(asset.ticker)
  return asset.ticker || '—'
}

function displayAssetSubtitle(asset) {
  const fallback = asset.sector || '—'
  const companyName = String(asset.companyName || '').trim()
  if (!companyName) return fallback
  if (asset.assetClass !== 'Crypto') return companyName
  return companyName.replace(/\s+USD$/i, '').trim() || fallback
}

function assetGainLossClass(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return ''
  return gainLossClass(n)
}

const assets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return positions.value
    .map((position) => {
      const assetClass = classifyAsset(position)
      const searchText = [
        position.ticker,
        position.companyName,
        position.sector,
        position.industry,
        assetClass,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return {
        ...position,
        assetClass,
        searchText,
      }
    })
    .filter((position) => !query || position.searchText.includes(query))
    .sort((a, b) => {
      const groupDiff =
        groupOrder.indexOf(a.assetClass) - groupOrder.indexOf(b.assetClass)
      if (groupDiff !== 0) return groupDiff
      return (b.value || 0) - (a.value || 0)
    })
})

const groupCounts = computed(() =>
  assets.value.reduce((counts, asset) => {
    counts[asset.assetClass] = (counts[asset.assetClass] || 0) + 1
    return counts
  }, {}),
)

const assetGroups = computed(() =>
  groupOrder
    .map((assetClass) => ({
      assetClass,
      assets: assets.value.filter((asset) => asset.assetClass === assetClass),
    }))
    .filter((group) => group.assets.length),
)

const selectedCount = computed(() => selectedAssets.value.length)
const selectedAssetIds = computed(() => new Set(selectedAssets.value.map((asset) => asset._id)))

const newAssetMenuItems = [
  {
    label: 'Buy Asset',
    icon: 'pi pi-plus',
    command: () => { showTxModal.value = true },
  },
  {
    label: 'Import holdings',
    icon: 'pi pi-upload',
    command: () => { showImportModal.value = true },
  },
]

const pageMenuItems = computed(() => [
  {
    label: 'Refresh assets',
    icon: 'pi pi-refresh',
    command: () => refreshPortfolio(),
  },
  {
    label: 'Export CSV',
    icon: 'pi pi-download',
    command: () => exportCsv(),
  },
])

const selectedAssetCountLabel = computed(() => {
  const count = selectedAssets.value.length
  return `${count} selected`
})

const rowMenuItems = computed(() => [
  {
    label: 'Open position',
    icon: 'pi pi-external-link',
    command: () => openAsset(activeAsset.value),
  },
  {
    label: 'Buy Stock',
    icon: 'pi pi-arrow-down',
    command: () => openAssetTransactionWithType(activeAsset.value, 'buy'),
  },
  {
    label: 'Sell Stock',
    icon: 'pi pi-arrow-up',
    command: () => openAssetTransactionWithType(activeAsset.value, 'sell'),
  },
  {
    label: 'Add transaction',
    icon: 'pi pi-plus',
    command: () => openAssetTransaction(activeAsset.value),
  },
  {
    label: 'Update Record',
    icon: 'pi pi-pencil',
    command: () => openAssetUpdate(activeAsset.value),
  },
])

async function refreshPortfolio() {
  await portfolio.fetchPortfolio().catch(() => {})
}

async function refreshAfterRecordSaved() {
  await Promise.all([
    refreshPortfolio(),
    auth.canUsePremiumFeatures ? fetchProjection().catch(() => {}) : Promise.resolve(),
    auth.canUsePremiumFeatures ? dashboard.fetchIncomeProjection().catch(() => {}) : Promise.resolve(),
  ])
}

function clearSelection() {
  selectedAssets.value = []
}

function assetsForGroup(assetClass) {
  return assets.value.filter((asset) => asset.assetClass === assetClass)
}

function isGroupSelected(assetClass) {
  const groupAssets = assetsForGroup(assetClass)
  return groupAssets.length > 0 && groupAssets.every((asset) => selectedAssetIds.value.has(asset._id))
}

function isGroupPartiallySelected(assetClass) {
  const groupAssets = assetsForGroup(assetClass)
  return groupAssets.some((asset) => selectedAssetIds.value.has(asset._id)) && !isGroupSelected(assetClass)
}

function toggleAssetSelection(asset, checked = !selectedAssetIds.value.has(asset._id)) {
  selectedAssets.value = checked
    ? [...selectedAssets.value.filter((item) => item._id !== asset._id), asset]
    : selectedAssets.value.filter((item) => item._id !== asset._id)
}

function toggleGroupSelection(assetClass, checked = !isGroupSelected(assetClass)) {
  const groupAssets = assetsForGroup(assetClass)
  const groupIds = new Set(groupAssets.map((asset) => asset._id))
  const otherSelected = selectedAssets.value.filter((asset) => !groupIds.has(asset._id))
  selectedAssets.value = checked ? [...otherSelected, ...groupAssets] : otherSelected
}

async function archiveSelected() {
  if (!selectedAssets.value.length) return
  await api.put('/portfolio/positions/archive', {
    ids: selectedAssets.value.map((asset) => asset._id),
  })
  clearSelection()
  await refreshPortfolio()
}

async function deleteSelected() {
  if (!selectedAssets.value.length) return
  const ids = selectedAssets.value.map((asset) => asset._id)
  for (const id of ids) {
    await api.delete(`/portfolio/position/${id}`)
  }
  clearSelection()
  await refreshPortfolio()
}

function exportCsv() {
  const rows = [
    ['Group', 'Ticker', 'Company', 'Currency', 'Quantity', 'Unit Value', 'Cost Basis', 'P/L', 'P/L %', 'Total Value'],
    ...assets.value.map((asset) => [
      asset.assetClass,
      asset.ticker,
      asset.companyName || '',
      asset.currency || '',
      asset.shares ?? '',
      asset.currentPrice ?? '',
      asset.avgCost ?? '',
      asset.pnl ?? '',
      asset.pnlPercent ?? '',
      asset.value ?? '',
    ]),
  ]
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `assets_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function openAsset(asset) {
  if (!asset?.ticker) return
  openPosition(asset.ticker, asset.companyName || '')
}

function openAssetRow(event) {
  const target = event?.originalEvent?.target
  if (target?.closest?.('button, a, input, .p-checkbox, .p-button, [role="button"]')) return
  openAsset(event?.data)
}

function openAssetTransaction(asset) {
  activeAsset.value = asset || null
  txModalType.value = 'buy'
  showTxModal.value = true
}

function openAssetTransactionWithType(asset, txType) {
  activeAsset.value = asset || null
  txModalType.value = txType
  showTxModal.value = true
}

function openAssetUpdate(asset) {
  activeAsset.value = asset || null
  showUpdateModal.value = true
}

function openRowMenu(event, asset) {
  activeAsset.value = asset
  rowMenu.value?.toggle(event)
}

onMounted(() => {
  desktopFocus.clear()

  if (!positions.value.length && !loading.value) {
    portfolio.fetchPortfolio().catch(() => {})
  }

  if (auth.canUsePremiumFeatures) fetchProjection().catch(() => {})
})
</script>

<template>
  <div class="assets-page">
    <Teleport to="#layout-topbar-actions" defer>
      <div class="top-actions">
        <button class="top-action primary" type="button" @click="newAssetMenu?.toggle($event)">
          <i class="pi pi-plus" />
          <span>New Asset</span>
          <i class="pi pi-chevron-down new-asset-caret" />
        </button>
        <button class="top-action" type="button" @click="pageMenu?.toggle($event)">
          <i class="pi pi-ellipsis-h" />
        </button>
        <Menu ref="newAssetMenu" :model="newAssetMenuItems" popup />
        <Menu ref="pageMenu" :model="pageMenuItems" popup />
      </div>
    </Teleport>

    <header class="assets-header">
      <div class="assets-heading">
        <h1>Portfolio Assets</h1>
      </div>
      <label class="assets-search">
        <i class="pi pi-search" />
        <InputText v-model="searchQuery" placeholder="Search assets..." fluid />
      </label>
    </header>

    <IncomeProjectionChart
      v-if="assets.length && auth.canUsePremiumFeatures"
      class="assets-income-card"
      :data="incomeMonths"
      :loading="incomeLoading"
      :totals="incomeTotals"
    />

    <div v-if="loading && !assets.length" class="assets-loading">
      <AppLoader />
    </div>

    <section v-else class="assets-table-shell">
      <div v-if="!assets.length" class="assets-empty">
        <i class="pi pi-briefcase" />
        <h2>No assets yet</h2>
        <p>Add a transaction to begin building your table.</p>
        <Button
          icon="pi pi-plus"
          label="New Asset"
          @click="showTxModal = true"
        />
      </div>

      <template v-else>
        <div class="assets-mobile-list">
          <section v-for="group in assetGroups" :key="group.assetClass" class="mobile-asset-group">
            <div class="mobile-asset-group-head">
              <button
                class="mobile-group-select"
                type="button"
                @click="toggleGroupSelection(group.assetClass)"
              >
                <Checkbox
                  :binary="true"
                  :indeterminate="isGroupPartiallySelected(group.assetClass)"
                  :model-value="isGroupSelected(group.assetClass)"
                  @click.stop
                  @update:modelValue="toggleGroupSelection(group.assetClass, $event)"
                />
                <span>{{ group.assetClass }}</span>
              </button>
              <Tag :value="group.assets.length" severity="secondary" />
            </div>

            <article
              v-for="asset in group.assets"
              :key="asset._id"
              class="mobile-asset-card"
              :class="{ selected: selectedAssetIds.has(asset._id) }"
              @click="openAsset(asset)"
            >
              <div class="mobile-asset-main">
                <Checkbox
                  :binary="true"
                  :model-value="selectedAssetIds.has(asset._id)"
                  @click.stop
                  @update:modelValue="toggleAssetSelection(asset, $event)"
                />
                <div class="mobile-asset-name">
                  <strong>{{ displayAssetTicker(asset) }}</strong>
                  <span>{{ displayAssetSubtitle(asset) }}</span>
                </div>
                <Tag :value="asset.currency" />
                <Button
                  icon="pi pi-ellipsis-v"
                  severity="secondary"
                  text
                  type="button"
                  class="row-menu-btn"
                  @click.stop="openRowMenu($event, asset)"
                />
              </div>

              <div class="mobile-asset-values">
                <div>
                  <span>Quantity</span>
                  <strong>{{ formatNumber(asset.shares, 0) }}</strong>
                </div>
                <div>
                  <span>Unit</span>
                  <strong>{{ formatPrice(asset.currentPrice) }}</strong>
                </div>
                <div>
                  <span>Cost</span>
                  <strong>{{ formatPrice(asset.avgCost) }}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{{ formatPrice(asset.value) }}</strong>
                </div>
                <div>
                  <span>P/L</span>
                  <strong :class="assetGainLossClass(asset.pnl)">{{ formatSignedNumber(asset.pnl) }}</strong>
                </div>
                <div>
                  <span>P/L %</span>
                  <strong :class="assetGainLossClass(asset.pnlPercent)">{{ usePercent(asset.pnlPercent) }}</strong>
                </div>
              </div>
            </article>
          </section>
        </div>

        <DataTable
          v-model:selection="selectedAssets"
          :value="assets"
          dataKey="_id"
          groupRowsBy="assetClass"
          responsiveLayout="scroll"
          rowHover
          rowGroupMode="subheader"
          size="small"
          sortField="assetClass"
          sortOrder="1"
          stripedRows
          class="assets-table"
          tableStyle="width:max-content;min-width:100%"
          @row-click="openAssetRow"
        >
          <template #groupheader="{ data }">
            <div
              class="asset-group-header"
              role="button"
              tabindex="0"
              @click="toggleGroupSelection(data.assetClass)"
              @keydown.enter.prevent="toggleGroupSelection(data.assetClass)"
              @keydown.space.prevent="toggleGroupSelection(data.assetClass)"
            >
              <Checkbox
                :binary="true"
                :indeterminate="isGroupPartiallySelected(data.assetClass)"
                :model-value="isGroupSelected(data.assetClass)"
                :inputId="`asset-group-${data.assetClass}`"
                @click.stop
                @update:modelValue="toggleGroupSelection(data.assetClass, $event)"
              />
              <div class="asset-group-title">
                <span>{{ data.assetClass }}</span>
                <Tag :value="groupCounts[data.assetClass] || 0" severity="secondary" />
              </div>
            </div>
          </template>

          <Column
            selectionMode="multiple"
            headerStyle="width:2.55rem"
            bodyStyle="width:2.55rem;text-align:center"
          />

          <Column
            field="ticker"
            header="Name"
            headerClass="asset-table-name"
            bodyClass="asset-table-name"
            headerStyle="min-width:150px;width:150px"
            sortable
          >
            <template #body="{ data }">
              <div class="asset-name">
                <span>{{ displayAssetTicker(data) }}</span>
                <span>{{ displayAssetSubtitle(data) }}</span>
              </div>
            </template>
          </Column>

          <Column
            field="currency"
            header="Currency"
            headerClass="asset-table-center"
            bodyClass="asset-table-center"
            headerStyle="width:52px"
            sortable
          >
            <template #body="{ data }">
              <Tag :value="data.currency" />
            </template>
          </Column>

          <Column
            field="shares"
            header="Quantity"
            headerClass="asset-table-number"
            bodyClass="asset-table-number"
            headerStyle="width:62px"
            sortable
          >
            <template #body="{ data }">
              {{ formatNumber(data.shares, 0) }}
            </template>
          </Column>

          <Column
            field="currentPrice"
            header="Unit value"
            headerClass="asset-table-number"
            bodyClass="asset-table-number"
            headerStyle="width:78px"
            sortable
          >
            <template #body="{ data }">
              {{ formatPrice(data.currentPrice) }}
            </template>
          </Column>

          <Column
            field="avgCost"
            header="Cost basis"
            headerClass="asset-table-number"
            bodyClass="asset-table-number"
            headerStyle="width:78px"
            sortable
          >
            <template #body="{ data }">
              {{ formatPrice(data.avgCost) }}
            </template>
          </Column>

          <Column
            field="pnl"
            header="P/L"
            headerClass="asset-table-number"
            bodyClass="asset-table-number"
            headerStyle="width:68px"
            sortable
          >
            <template #body="{ data }">
              <span :class="assetGainLossClass(data.pnl)">{{ formatSignedNumber(data.pnl) }}</span>
            </template>
          </Column>

          <Column
            field="pnlPercent"
            header="P/L %"
            headerClass="asset-table-number"
            bodyClass="asset-table-number"
            headerStyle="width:68px"
            sortable
          >
            <template #body="{ data }">
              <span :class="assetGainLossClass(data.pnlPercent)">{{ usePercent(data.pnlPercent) }}</span>
            </template>
          </Column>

          <Column
            field="value"
            header="Total value"
            headerClass="asset-table-number asset-table-total"
            bodyClass="asset-table-number asset-table-total"
            headerStyle="width:78px"
            sortable
          >
            <template #body="{ data }">
              {{ formatPrice(data.value) }}
            </template>
          </Column>

          <Column
            headerClass="asset-table-action"
            bodyClass="asset-table-action"
            headerStyle="width:34px"
            bodyStyle="width:34px;text-align:center"
          >
            <template #body="{ data }">
              <Button
                icon="pi pi-ellipsis-h"
                severity="secondary"
                text
                type="button"
                class="row-menu-btn"
                @click.stop="openRowMenu($event, data)"
              />
            </template>
          </Column>
          <Column
            field="assetClass"
            headerClass="asset-table-group-spacer"
            bodyClass="asset-table-group-spacer"
            headerStyle="width:0;max-width:0;padding:0;border:0"
            bodyStyle="width:0;max-width:0;padding:0;border:0"
          >
            <template #body />
          </Column>
        </DataTable>

        <Toolbar v-if="selectedCount" class="assets-selection-bar">
          <template #end>
            <div class="assets-selection-actions">
              <span class="assets-selection-count">{{ selectedAssetCountLabel }}</span>
              <Button
                icon="pi pi-archive"
                label="Archive selected"
                outlined
                size="small"
                @click="archiveSelected"
              />
              <Button
                icon="pi pi-trash"
                label="Delete selected"
                severity="danger"
                outlined
                size="small"
                class="assets-delete-selected"
                @click="deleteSelected"
              />
            </div>
          </template>
        </Toolbar>

        <footer class="assets-footer">
          <span>{{ assets.length }} asset<span v-if="assets.length !== 1">s</span></span>
        </footer>
      </template>
    </section>

    <Menu ref="rowMenu" :model="rowMenuItems" popup />
    <AddTransactionModal
      v-model:visible="showTxModal"
      :default-ticker="activeAsset?.ticker || ''"
      :default-type="txModalType"
      :default-shares="txModalType === 'sell' ? activeAsset?.shares : null"
      :max-shares="txModalType === 'sell' ? activeAsset?.shares : null"
      :avg-cost="txModalType === 'sell' ? activeAsset?.avgCost : null"
      :total-cost="txModalType === 'sell' ? (activeAsset?.shares ?? 0) * (activeAsset?.avgCost ?? 0) : null"
      @saved="refreshAfterRecordSaved"
    />
    <AddTransactionModal
      v-model:visible="showUpdateModal"
      :default-ticker="activeAsset?.ticker || ''"
      :default-shares="activeAsset?.shares ?? null"
      default-type="update"
      @saved="refreshAfterRecordSaved"
    />
    <ImportModal v-model:visible="showImportModal" mode="holdings" />
  </div>
</template>

<style scoped>
.assets-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 100%;
}

.assets-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.assets-heading h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 400;
  line-height: 1.1;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.top-action {
  display: flex;
  align-items: center;
  min-height: 36px;
  gap: 0.45rem;
  border: 1px solid var(--desktop-border);
  border-radius: 7px;
  background: var(--desktop-panel);
  color: var(--desktop-text);
  padding: 0 0.8rem;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--desktop-elevated-shadow);
}

.top-action i {
  font-size: 0.86rem;
}

.new-asset-caret {
  font-size: 0.68rem !important;
  margin-left: 0.1rem;
}

.top-action.primary {
  background: var(--neon-blue);
  border-color: var(--neon-blue);
  color: #000;
}

:root[data-theme="light"] .top-action.primary {
  background: #1a6cf5;
  border-color: #1a6cf5;
  color: #fff;
}

.assets-search {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: min(22rem, 100%);
  padding: 0 0.9rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  background: var(--bg-card);
  color: var(--text-secondary);
  height: 2.65rem;
}

.assets-selection-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  max-width: 100%;
  padding: 0.2rem 0.25rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.assets-selection-bar :deep(.p-toolbar) {
  background: transparent;
  border: 0;
  padding: 0;
}

.assets-selection-bar :deep(.p-toolbar-end) {
  margin-left: auto;
}

.assets-selection-count {
  color: var(--text-secondary);
  font-size: 0.92rem;
  white-space: nowrap;
}

.assets-selection-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.assets-selection-actions :deep(.p-button) {
  height: 1.95rem;
  padding-inline: 0.75rem;
  font-size: 0.85rem;
}

.assets-selection-actions :deep(.p-button-label),
.assets-selection-actions :deep(.p-button-icon) {
  display: inline-flex;
  color: inherit;
}

.assets-delete-selected {
  color: var(--color-danger, #dc2626);
  border-color: color-mix(in srgb, var(--color-danger, #dc2626) 45%, transparent);
}

.assets-delete-selected:hover {
  color: var(--color-danger, #dc2626);
  border-color: var(--color-danger, #dc2626);
  background: color-mix(in srgb, var(--color-danger, #dc2626) 8%, transparent);
}

.assets-search {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: min(22rem, 100%);
  padding: 0 0.9rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  background: var(--bg-card);
  color: var(--text-secondary);
  height: 2.65rem;
}

.assets-search :deep(.p-inputtext) {
  border: 0;
  box-shadow: none;
  padding-left: 0;
  min-width: 0;
}

.assets-search :deep(.p-inputtext:focus) {
  box-shadow: none;
}

.assets-loading,
.assets-empty {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--bg-card);
}

.assets-loading {
  min-height: 16rem;
  display: grid;
  place-items: center;
}

.assets-empty {
  min-height: 22rem;
  display: grid;
  place-items: center;
  text-align: center;
  gap: 0.5rem;
  color: var(--text-secondary);
}

.assets-empty i {
  font-size: 1.85rem;
  color: var(--text-secondary);
}

.assets-empty h2 {
  margin: 0.2rem 0 0;
  color: var(--text-primary);
}

.assets-empty p {
  margin: 0;
  max-width: 28rem;
}

.assets-table-shell {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.assets-mobile-list {
  display: none;
}

.assets-income-card {
  margin-bottom: 1rem;
}

.asset-group {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  background: var(--bg-card);
  overflow: hidden;
}

.asset-group-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.45rem;
  width: 100%;
  padding: 0.32rem 0.5rem;
  cursor: pointer;
  outline: none;
}

.asset-group-header:hover {
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
}

.asset-group-header:focus-visible {
  box-shadow: inset 0 0 0 1px var(--accent);
}

.asset-group-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.asset-group-title strong {
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.asset-group-title span {
  font-size: 0.76rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.asset-group-meta {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.asset-name {
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 0.28rem;
  min-width: 0;
}

.asset-name strong,
.asset-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-name span:first-child {
  color: var(--text-primary);
  font-size: 0.76rem;
}

.asset-name span {
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.assets-table :deep(.p-checkbox) {
  vertical-align: middle;
}

.assets-table :deep(.p-datatable-header) {
  display: none;
}

.assets-table :deep(.p-datatable-table-container),
.assets-table :deep(.p-datatable-wrapper) {
  border: 1px solid var(--border);
  border-radius: 0.45rem;
  overflow: hidden;
}

.assets-table :deep(.p-datatable-table) {
  width: max-content;
  min-width: 100%;
  table-layout: auto;
}

.assets-table :deep(.p-datatable-thead > tr > th),
.assets-table :deep(.p-datatable-tbody > tr > td) {
  padding: 0.26rem 0.32rem;
  font-size: 0.74rem;
  border-color: var(--border);
}

.assets-table :deep(.p-datatable-thead > tr > th) {
  color: var(--text-secondary);
  font-weight: 400;
  white-space: nowrap;
}

.assets-table :deep(.p-datatable-tbody > tr > td) {
  background: transparent;
  color: var(--text-primary);
  white-space: nowrap;
  height: 2.15rem;
  border-bottom: 0;
}

.assets-table :deep(.p-datatable-tbody > tr:not(.p-datatable-row-group-header):not(.p-rowgroup-header)) {
  cursor: pointer;
}

.assets-table :deep(.p-datatable-tbody > tr.p-datatable-row-striped > td),
.assets-table :deep(.p-datatable-tbody > tr:nth-child(even) > td) {
  background: transparent;
}

.assets-table :deep(.p-datatable-tbody > tr > td:last-child) {
  border-bottom: 0;
}

.assets-table :deep([hidden]) {
  display: none !important;
  width: 0 !important;
  padding: 0 !important;
  border: 0 !important;
}

.assets-table :deep(.asset-table-group-spacer) {
  width: 0 !important;
  max-width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: hidden !important;
}

.assets-table :deep(.asset-table-number) {
  text-align: center;
}

.assets-table :deep(.asset-table-center) {
  text-align: center;
}

.assets-table :deep(.asset-table-name) {
  min-width: 150px;
  width: 150px;
}

.assets-table :deep(th.asset-table-number .p-column-header-content),
.assets-table :deep(th.asset-table-center .p-column-header-content) {
  justify-content: center;
}

.assets-table :deep(.asset-table-total) {
  padding-right: 0.32rem;
}

.assets-table :deep(.asset-table-action) {
  padding-left: 0.1rem;
  padding-right: 0.18rem;
  text-align: center;
}

.assets-table :deep(.p-datatable-tbody > tr.p-datatable-row-group-header > td),
.assets-table :deep(.p-datatable-tbody > tr.p-rowgroup-header > td) {
  padding: 0;
  border-bottom: 0;
  border-right: 0;
  width: 100%;
}

.assets-table :deep(.p-datatable-tbody > tr.p-datatable-row-group-header > td:last-child),
.assets-table :deep(.p-datatable-tbody > tr.p-rowgroup-header > td:last-child) {
  border-right: 0;
}

.assets-table :deep(.p-datatable-tbody > tr.p-datatable-row-group-header > td:first-child),
.assets-table :deep(.p-datatable-tbody > tr.p-rowgroup-header > td:first-child) {
  border-left: 0;
}

.assets-table :deep(.p-datatable-tbody > tr.p-rowgroup-header) {
  background: transparent;
}

.assets-table :deep(.p-tag) {
  font-size: 0.64rem;
  font-weight: 400;
  line-height: 1;
  min-height: 1.18rem;
  padding: 0.16rem 0.38rem;
  border-radius: 0.3rem;
}

.row-menu-btn {
  width: 1.45rem;
  height: 1.45rem;
  padding: 0;
}

.row-menu-btn :deep(.p-button-icon) {
  font-size: 0.82rem;
}

.gain {
  color: var(--green, var(--neon-green, #22c55e));
}

.loss {
  color: var(--red, var(--neon-red, #ef4444));
}

.assets-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  color: var(--text-secondary);
  font-size: 0.9rem;
  padding: 0 0.25rem;
}

.mobile-asset-group,
.mobile-asset-card,
.mobile-asset-main,
.mobile-asset-values {
  min-width: 0;
}

.mobile-asset-group {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.mobile-asset-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0 0.1rem;
}

.mobile-group-select {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.mobile-asset-card {
  border: 1px solid var(--border);
  border-radius: 0.55rem;
  background: var(--bg-card);
  padding: 0.7rem;
  transition: border-color 0.15s, background 0.15s;
}

.mobile-asset-card.selected {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--bg-card));
}

.mobile-asset-main {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.55rem;
}

.mobile-asset-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mobile-asset-name strong,
.mobile-asset-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-asset-name strong {
  color: var(--text-primary);
  font-size: 0.95rem;
}

.mobile-asset-name span {
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.mobile-asset-values {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem 0.5rem;
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--border);
}

.mobile-asset-values div {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.mobile-asset-values span {
  color: var(--text-secondary);
  font-size: 0.68rem;
}

.mobile-asset-values strong {
  overflow: hidden;
  color: var(--text-primary);
  font-size: 0.82rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 767px) {
  .assets-page {
    gap: 0.85rem;
    padding: 1rem 1rem calc(1rem + var(--safe-bottom, 0px));
  }

  .assets-header {
    flex-direction: column;
    gap: 0.8rem;
  }

  .assets-heading h1 {
    font-size: 1.55rem;
  }

  .assets-toolbar,
  .assets-search {
    width: 100%;
  }

  .assets-mobile-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .assets-table {
    display: none;
  }

  .assets-selection-bar {
    position: sticky;
    bottom: calc(var(--nav-height, 75px) + var(--safe-bottom, 0px) + 0.5rem);
    z-index: 20;
    margin: 0;
    border-radius: 0.6rem;
    background: var(--bg-card);
  }

  .assets-selection-actions {
    width: 100%;
    justify-content: space-between;
  }

  .assets-selection-actions :deep(.p-button-label) {
    display: none;
  }
}
</style>
