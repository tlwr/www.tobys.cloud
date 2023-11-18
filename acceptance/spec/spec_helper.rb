require 'rspec'
require 'irb'

require 'mechanize'

RSpec.shared_context 'http' do
  let (:agent) do
    Mechanize.new do |a|
      a.user_agent_alias = 'Mac Firefox'
    end
  end
end

RSpec.configure do |config|
  config.include_context 'http'
end
