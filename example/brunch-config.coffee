exports.config =
  paths:
    public: './public'
    watched: ['app']


  files:
    javascripts:
      joinTo:
        '/js/master.js': /^(app|node_modules)/
    stylesheets:
      joinTo:
        '/css/master.css': /^(app)/

  modules:
    autoRequire:
      '/js/master.js': ['realtime-bpm-analyzer']

  npm:
    enabled: true

  plugins:
    cleancss:
      keepSpecialComments: 0
      removeEmpty: true
    sass:
      mode: 'native'
      debug: 'comments'
      allowCache: true
