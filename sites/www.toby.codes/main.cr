require "markdown"
require "kemal"

macro render_post(path)
  content = Markdown.to_html(File.read(path))
  ECR.render("views/layout.ecr")
end

macro render_view(filepath)
  render "views/#{{{filepath}}}.ecr", "views/layout.ecr"
end

macro posts
 Dir
    .glob("views/posts/*.md")
    .map { |path| [File.basename(path).gsub(/[.]md$/, ""), render_post(path)] }
    .to_h
end

error 404 do
  render "views/404.ecr", "views/layout.ecr"
end

error 500 do
  render "views/500.ecr", "views/layout.ecr"
end

get "/" do
  render_view "index"
end

get "/posts/:slug" do |env|
  slug = env.params.url["slug"]

  unless posts.has_key?(slug)
    env.response.status_code = 404
    next
  end

  posts[slug]
end

Kemal.run
