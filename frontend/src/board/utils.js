export function capitalize(value) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

export function chunk(values, size) {
  const groups = []

  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size))
  }

  return groups
}
