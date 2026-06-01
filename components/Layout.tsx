useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsuario({ email: 'guto.wickert@gmail.com' })
    })
  }, [])