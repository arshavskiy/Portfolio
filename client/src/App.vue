<script setup>
import {onMounted} from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import {useAlertNotifier} from '@/composables/useAlertNotifier'

useAlertNotifier()

onMounted(() => document.documentElement.classList.add('dark'))
</script>

<template>
  <Toast position="top-center" />
  <ConfirmDialog />
  <RouterView />
</template>
