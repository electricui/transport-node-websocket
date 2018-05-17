import babel from 'rollup-plugin-babel'

export default {
  input: 'index.js',
  output: {
    file: 'lib/index.js',
    format: 'cjs'
  },
  plugins: [
    babel({
      exclude: 'node_modules/*',
      plugins: [
        'external-helpers',
        'minify-mangle-names',
        'minify-simplify',
        'transform-merge-sibling-variables',
        'minify-dead-code-elimination',
        'minify-constant-folding'
      ]
    })
  ]
}
