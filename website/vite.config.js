export default {
  plugins: [
    {
      name: 'fix-lucide-home-name-collision',
      enforce: 'pre',
      transform(source, id) {
        if (!id.endsWith('/website/src/App.jsx')) return null;
        return source
          .replace('CreditCard, Home, LogOut', 'CreditCard, Home as HomeIcon, LogOut')
          .replace("{ id: 'Home', icon: Home }", "{ id: 'Home', icon: HomeIcon }");
      },
    },
  ],
};
